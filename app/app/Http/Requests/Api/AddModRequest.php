<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class AddModRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'workshop_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'mod_id' => ['required', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
            'map_folder' => ['sometimes', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
        ];
    }
}
