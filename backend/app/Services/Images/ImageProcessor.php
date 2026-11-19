<?php

namespace App\Services\Images;

use App\Exceptions\LabException;
use Throwable;

/**
 * Validates an uploaded picture by its real content and re-encodes it.
 * Re-encoding strips EXIF/metadata and guarantees the stored bytes are an image.
 */
class ImageProcessor
{
    private const MAX_PIXELS = 50_000_000; // decode guard against decompression bombs

    /**
     * @return array{bytes:string,mime:string,ext:string,width:int,height:int}
     */
    public function process(string $bytes): array
    {
        $maxBytes = config('lab.limits.upload_mb') * 1024 * 1024;

        if ($bytes === '') {
            throw new LabException('invalid_image', 'That file is empty. Try another screenshot.');
        }

        if (strlen($bytes) > $maxBytes) {
            throw new LabException('too_large', 'That picture is too big. The limit is '.config('lab.limits.upload_mb').' MB.');
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';

        if (in_array($mime, ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'], true)) {
            $bytes = $this->convertHeic($bytes);
            $mime = 'image/jpeg';
        }

        if (! in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true)) {
            throw new LabException('invalid_image', 'That is not a picture we can read. Use a PNG, JPEG or WebP screenshot.');
        }

        $info = @getimagesizefromstring($bytes);

        if ($info === false || $info[0] < 1 || $info[1] < 1) {
            throw new LabException('invalid_image', 'That picture looks broken. Try taking the screenshot again.');
        }

        if ($info[0] * $info[1] > self::MAX_PIXELS) {
            throw new LabException('too_large', 'That picture has too many pixels. Try a normal screenshot.');
        }

        $image = @imagecreatefromstring($bytes);

        if ($image === false) {
            throw new LabException('invalid_image', 'That picture looks broken. Try taking the screenshot again.');
        }

        if ($mime === 'image/jpeg') {
            $image = $this->applyExifOrientation($image, $bytes);
        }

        $image = $this->downscale($image, (int) config('lab.limits.image_dimension'));

        return $this->encode($image, $mime);
    }

    private function convertHeic(string $bytes): string
    {
        $sorry = 'We could not open that iPad photo format (HEIC). Take a screenshot instead, or save it as JPEG.';

        if (! class_exists(\Imagick::class) || \Imagick::queryFormats('HEIC') === []) {
            throw new LabException('heic_unsupported', $sorry);
        }

        try {
            $imagick = new \Imagick;
            $imagick->readImageBlob($bytes);
            $imagick->setImageFormat('jpeg');
            $imagick->setImageCompressionQuality(92);

            return $imagick->getImageBlob();
        } catch (Throwable $e) {
            throw new LabException('heic_unsupported', $sorry, 422, [], 'HEIC conversion failed: '.$e->getMessage());
        }
    }

    private function applyExifOrientation(\GdImage $image, string $bytes): \GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data('data://image/jpeg;base64,'.base64_encode($bytes));
        $orientation = (int) ($exif['Orientation'] ?? 1);

        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }

        $angle = match ($orientation) {
            3, 4 => 180,
            5, 6 => -90,
            7, 8 => 90,
            default => 0,
        };

        if ($angle !== 0) {
            $rotated = imagerotate($image, $angle, 0);
            if ($rotated !== false) {
                $image = $rotated;
            }
        }

        return $image;
    }

    private function downscale(\GdImage $image, int $max): \GdImage
    {
        $w = imagesx($image);
        $h = imagesy($image);

        if ($w <= $max && $h <= $max) {
            return $image;
        }

        $scale = $max / max($w, $h);
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));

        $scaled = imagecreatetruecolor($nw, $nh);
        imagealphablending($scaled, false);
        imagesavealpha($scaled, true);
        imagecopyresampled($scaled, $image, 0, 0, 0, 0, $nw, $nh, $w, $h);

        return $scaled;
    }

    /** @return array{bytes:string,mime:string,ext:string,width:int,height:int} */
    private function encode(\GdImage $image, string $mime): array
    {
        if ($mime === 'image/webp' && ! function_exists('imagewebp')) {
            $mime = 'image/png';
        }

        if ($mime !== 'image/jpeg') {
            imagepalettetotruecolor($image);
            imagealphablending($image, false);
            imagesavealpha($image, true);
        }

        ob_start();
        match ($mime) {
            'image/jpeg' => imagejpeg($image, null, 90),
            'image/webp' => imagewebp($image, null, 90),
            default => imagepng($image, null, 6),
        };
        $out = (string) ob_get_clean();

        if ($out === '') {
            throw new LabException('invalid_image', 'We could not save that picture. Try another screenshot.');
        }

        return [
            'bytes' => $out,
            'mime' => $mime,
            'ext' => ['image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/png' => 'png'][$mime],
            'width' => imagesx($image),
            'height' => imagesy($image),
        ];
    }
}
