<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Exceptions\LabException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

trait ReadsUploadedImage
{
    /** The uploaded `image` file, checked for arrival and size. Its bytes are not read yet. */
    protected function uploadedImage(Request $request): UploadedFile
    {
        $file = $request->file('image');
        $limit = config('lab.limits.upload_mb');

        if ($file === null) {
            // Also the case when PHP dropped the upload for exceeding upload_max_filesize.
            throw new LabException('invalid_image', 'We did not get a picture. It may be too big (limit '.$limit.' MB).');
        }

        if (! $file->isValid()) {
            if (in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                throw new LabException('too_large', 'That picture is too big. The limit is '.$limit.' MB.');
            }

            throw new LabException('upload_failed', 'The picture did not arrive properly. Please try again.', 500, [], 'PHP upload error code '.$file->getError());
        }

        // Size is checked before the bytes are read into memory.
        if ($file->getSize() > $limit * 1024 * 1024) {
            throw new LabException('too_large', 'That picture is too big. The limit is '.$limit.' MB.');
        }

        return $file;
    }
}
