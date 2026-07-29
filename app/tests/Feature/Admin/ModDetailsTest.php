<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    Cache::flush();
});

function fakeWorkshopBatch(): void
{
    Http::fake([
        'api.steampowered.com/*' => Http::response([
            'response' => [
                'publishedfiledetails' => [
                    [
                        'result' => 1,
                        'publishedfileid' => '111',
                        'title' => 'B42 Mod',
                        'description' => "Great mod.\nMod ID: B42Mod",
                        'preview_url' => 'https://example.invalid/b42.jpg',
                        'tags' => [['tag' => 'Build 42'], ['tag' => 'Items']],
                        'time_updated' => 1750000000,
                        'file_size' => '123456',
                        'subscriptions' => 4200,
                    ],
                    [
                        'result' => 1,
                        'publishedfileid' => '222',
                        'title' => 'Legacy Mod',
                        'description' => "Old mod.\nMod ID: LegacyMod",
                        'tags' => [['tag' => 'Build 41']],
                    ],
                    [
                        'result' => 9,
                        'publishedfileid' => '333',
                    ],
                ],
            ],
        ]),
    ]);
}

it('returns batched workshop details with build compatibility', function () {
    fakeWorkshopBatch();

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/details', ['workshop_ids' => ['111', '222', '333']])
        ->assertOk()
        ->assertJsonPath('details.111.title', 'B42 Mod')
        ->assertJsonPath('details.111.build_compat', 'b42')
        ->assertJsonPath('details.111.preview_url', 'https://example.invalid/b42.jpg')
        ->assertJsonPath('details.111.mod_ids', ['B42Mod'])
        ->assertJsonPath('details.111.tags', ['Build 42', 'Items'])
        ->assertJsonPath('details.111.time_updated', 1750000000)
        ->assertJsonPath('details.111.file_size', 123456)
        ->assertJsonPath('details.111.subscriptions', 4200)
        ->assertJsonPath('details.222.build_compat', 'b41')
        ->assertJsonPath('details.333', null);

    Http::assertSentCount(1);
});

it('serves repeated detail requests from cache', function () {
    fakeWorkshopBatch();

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/details', ['workshop_ids' => ['111', '222']])
        ->assertOk();
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/details', ['workshop_ids' => ['111', '222']])
        ->assertOk()
        ->assertJsonPath('details.111.build_compat', 'b42');

    Http::assertSentCount(1);
});

it('marks untagged mods as unknown compatibility', function () {
    Http::fake([
        'api.steampowered.com/*' => Http::response([
            'response' => [
                'publishedfiledetails' => [[
                    'result' => 1,
                    'publishedfileid' => '444',
                    'title' => 'Untagged',
                    'description' => 'Mod ID: Untagged',
                ]],
            ],
        ]),
    ]);

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/details', ['workshop_ids' => ['444']])
        ->assertOk()
        ->assertJsonPath('details.444.build_compat', 'unknown');
});

it('rejects invalid workshop id lists', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/details', ['workshop_ids' => 'nope'])
        ->assertStatus(422);

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/details', ['workshop_ids' => ['abc']])
        ->assertStatus(422);
});

it('includes build compatibility in single lookups', function () {
    fakeWorkshopBatch();

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/lookup', ['workshop_id' => '111'])
        ->assertOk()
        ->assertJsonPath('build_compat', 'b42');
});
