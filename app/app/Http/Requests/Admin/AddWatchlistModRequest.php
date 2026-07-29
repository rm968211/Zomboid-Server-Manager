<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class AddWatchlistModRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'workshop_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
        ];
    }
}
