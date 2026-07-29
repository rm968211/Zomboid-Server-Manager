<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class ModDetailsRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'workshop_ids' => ['required', 'array', 'max:500'],
            'workshop_ids.*' => ['string', 'regex:/^\d{1,20}$/'],
        ];
    }
}
