<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreModBundleRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'workshop_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'target' => ['required', Rule::in(['installed', 'wishlist'])],
        ];
    }
}
