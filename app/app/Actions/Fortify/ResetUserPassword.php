<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Models\User;
use App\Services\PzPasswordSyncService;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\ResetsUserPasswords;

class ResetUserPassword implements ResetsUserPasswords
{
    use PasswordValidationRules;

    public function __construct(
        private readonly PzPasswordSyncService $pzPasswordSync,
    ) {}

    /**
     * Validate and reset the user's forgotten password.
     *
     * @param  array<string, string>  $input
     */
    public function reset(User $user, array $input): void
    {
        Validator::make($input, [
            'password' => $this->passwordRules(),
        ])->validate();

        $pzUsername = $user->whitelistEntries()
            ->where('active', true)
            ->value('pz_username');

        if ($pzUsername !== null) {
            $this->pzPasswordSync->sync($pzUsername, $input['password']);
        }

        $user->forceFill([
            'password' => $input['password'],
        ])->save();
    }
}
