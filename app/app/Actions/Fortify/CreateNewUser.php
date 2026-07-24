<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Concerns\ProfileValidationRules;
use App\Enums\UserRole;
use App\Models\User;
use App\Models\WhitelistEntry;
use App\Services\PzAccountAuthenticator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, ProfileValidationRules;

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            ...$this->registrationRules(),
            'password' => $this->passwordRules(),
        ])->validate();

        return DB::transaction(function () use ($input) {
            $user = User::create([
                'username' => $input['username'],
                'name' => $input['username'],
                'email' => $input['email'] ?? null,
                'password' => $input['password'],
                'role' => UserRole::Player,
            ]);

            // Create PZ account in SQLite whitelist
            $this->createPzAccount($user, $input['username'], $input['password']);

            return $user;
        });
    }

    /**
     * Create a PZ game account in the SQLite whitelist database.
     */
    private function createPzAccount(User $user, string $username, string $password): void
    {
        $pzHash = PzAccountAuthenticator::hashForPz($password);

        DB::connection('pz_sqlite')
            ->table('whitelist')
            ->insert([
                'username' => $username,
                'password' => $pzHash,
            ]);

        try {
            WhitelistEntry::create([
                'user_id' => $user->id,
                'pz_username' => $username,
                'pz_password_hash' => $pzHash,
                'active' => true,
                'synced_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // The databases cannot share a transaction, so compensate for a
            // failed application write instead of leaving an orphan PZ login.
            DB::connection('pz_sqlite')
                ->table('whitelist')
                ->where('username', $username)
                ->delete();

            throw $e;
        }
    }
}
