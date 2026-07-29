<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class ImportWishlistRequest extends FormRequest
{
    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'workshop_ids' => ['required', 'array', 'min:1', 'max:1000'],
            'workshop_ids.*' => ['string', 'regex:/^\d{1,20}$/'],
        ];
    }
}
