<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

abstract class TestCase extends BaseTestCase
{
    protected const PASSWORD = 'test-lab-password-42';

    protected function setUp(): void
    {
        parent::setUp();

        // Tests never touch real services or real secrets, whatever the local .env says.
        config([
            'lab.password' => self::PASSWORD,
            'lab.vision.driver' => 'mock',
            'lab.vision.openai.key' => '',
            'lab.vision.openai.model' => '',
            'lab.vision.openai.base_url' => 'https://api.openai.com/v1',
            'lab.aibrain.base_url' => '',
            'lab.aibrain.key' => '',
        ]);

        Http::preventStrayRequests();
        Storage::fake('local');
    }

    /** Act as a browser that already passed the password gate. */
    protected function signIn(string $sid = 'test-session'): static
    {
        return $this->withSession(['lab_auth' => true, 'lab_auth_at' => now()->timestamp, 'lab_sid' => $sid]);
    }

    protected function pngBytes(int $width = 64, int $height = 48): string
    {
        $image = imagecreatetruecolor($width, $height);
        imagefilledrectangle($image, 0, 0, $width, $height, imagecolorallocate($image, 250, 200, 40));
        imagestring($image, 3, 2, 2, 'move', imagecolorallocate($image, 0, 0, 0));
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }

    protected function pngUpload(int $width = 64, int $height = 48, string $name = 'shot.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $this->pngBytes($width, $height));
    }
}
