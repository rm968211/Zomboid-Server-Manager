<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\PasswordUpdateRequest;
use App\Services\PzPasswordSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class PasswordController extends Controller
{
    public function __construct(
        private readonly PzPasswordSyncService $pzPasswordSync,
    ) {}

    /**
     * Show the user's password settings page.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/password');
    }

    /**
     * Update the user's password and sync to PZ SQLite.
     */
    public function update(PasswordUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();

        $pzUsername = $user->whitelistEntries()
            ->where('active', true)
            ->value('pz_username');

        if ($pzUsername !== null) {
            try {
                $this->pzPasswordSync->sync($pzUsername, $request->password);
            } catch (\Throwable) {
                throw ValidationException::withMessages([
                    'password' => 'The game account password could not be updated. Please try again when the game server data is available.',
                ]);
            }
        }

        $user->update([
            'password' => $request->password,
        ]);

        return back();
    }
}
