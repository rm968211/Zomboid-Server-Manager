<?php

use App\Models\ModBundle;
use App\Models\User;
use App\Models\WishlistMod;
use App\Services\ServerIniParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

const BUNDLE_ID = '9000000000';
const MEMBER_A = '9000000001';
const MEMBER_B = '9000000002';

/**
 * Steam marks a collection by publishing it under the Workshop's own app ID
 * (766) rather than the game's, and only collections come back from
 * GetCollectionDetails with children.
 */
function fakeSteamCollection(array $children = [MEMBER_A, MEMBER_B]): void
{
    Http::fake([
        '*GetCollectionDetails*' => Http::response([
            'response' => [
                'collectiondetails' => [[
                    'publishedfileid' => BUNDLE_ID,
                    'result' => 1,
                    'children' => array_map(
                        fn (string $id) => ['publishedfileid' => $id, 'filetype' => 0],
                        $children,
                    ),
                ]],
            ],
        ]),
        '*GetPublishedFileDetails*' => Http::response([
            'response' => [
                'publishedfiledetails' => [
                    [
                        'result' => 1,
                        'publishedfileid' => BUNDLE_ID,
                        'creator_app_id' => 766,
                        'consumer_app_id' => 108600,
                        'title' => 'Frockin Splendor Universe',
                        'description' => 'A collection of fine outfits.',
                    ],
                    [
                        'result' => 1,
                        'publishedfileid' => MEMBER_A,
                        'creator_app_id' => 108600,
                        'title' => 'Vol.1',
                        'description' => 'Mod ID: AlphaMod',
                    ],
                    [
                        'result' => 1,
                        'publishedfileid' => MEMBER_B,
                        'creator_app_id' => 108600,
                        'title' => 'Vol.2',
                        'description' => 'Mod ID: BetaMod',
                    ],
                ],
            ],
        ]),
    ]);
}

beforeEach(function () {
    Cache::flush();
    fakeSteamCollection();

    $this->admin = User::factory()->admin()->create();
    $this->tempDir = sys_get_temp_dir().'/pz_bundle_test_'.uniqid();
    mkdir($this->tempDir.'/Server', 0777, true);
    $this->iniPath = $this->tempDir.'/Server/ZomboidServer.ini';
    copy(base_path('tests/fixtures/server.ini'), $this->iniPath);
    config(['zomboid.paths.server_ini' => $this->iniPath]);

    $this->workshopContentPath = $this->tempDir.'/workshop_content';
    mkdir($this->workshopContentPath, 0777, true);
    config(['zomboid.paths.workshop_content' => $this->workshopContentPath]);
});

afterEach(function () {
    @unlink($this->tempDir.'/Server/.mod_state');
    @unlink($this->tempDir.'/Server/.mod_state_applied');
    @unlink($this->tempDir.'/Server/.config_state');
    @unlink($this->tempDir.'/Server/.config_state.lock');
    @unlink($this->iniPath);
    @rmdir($this->tempDir.'/Server');
    rrmdir($this->workshopContentPath);
    @rmdir($this->tempDir);
});

it('flags a workshop collection as a bundle and lists its members', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/lookup', ['workshop_id' => BUNDLE_ID])
        ->assertOk()
        ->assertJson([
            'found' => true,
            'is_bundle' => true,
            'members' => [MEMBER_A, MEMBER_B],
        ]);
});

it('does not flag an ordinary mod as a bundle', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/lookup', ['workshop_id' => MEMBER_A])
        ->assertOk()
        ->assertJson([
            'is_bundle' => false,
            'members' => [],
            'mod_ids' => ['AlphaMod'],
        ]);
});

it('installs every mod in a bundle and records the bundle', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/bundles', ['workshop_id' => BUNDLE_ID, 'target' => 'installed'])
        ->assertCreated()
        ->assertJson([
            'bundle_id' => BUNDLE_ID,
            'members' => [MEMBER_A, MEMBER_B],
            'unresolved' => [],
            'restart_required' => true,
        ]);

    $this->assertDatabaseHas('mod_bundles', ['workshop_id' => BUNDLE_ID]);

    $config = (new ServerIniParser)->read($this->iniPath);
    expect($config['Mods'])->toContain('AlphaMod', 'BetaMod')
        ->and($config['WorkshopItems'])->toContain(MEMBER_A, MEMBER_B)
        // The collection ID itself is not a mod — PZ would fail to download it.
        ->and($config['WorkshopItems'])->not->toContain(BUNDLE_ID);
});

it('wishlists every mod in a bundle and records the bundle', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/bundles', ['workshop_id' => BUNDLE_ID, 'target' => 'wishlist'])
        ->assertCreated();

    $this->assertDatabaseHas('mod_bundles', ['workshop_id' => BUNDLE_ID]);
    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => MEMBER_A]);
    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => MEMBER_B]);
    $this->assertDatabaseMissing('wishlist_mods', ['workshop_id' => BUNDLE_ID]);
});

it('expands a collection pasted into the plain wishlist form', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => BUNDLE_ID])
        ->assertCreated();

    $this->assertDatabaseHas('mod_bundles', ['workshop_id' => BUNDLE_ID]);
    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => MEMBER_A]);
    $this->assertDatabaseMissing('wishlist_mods', ['workshop_id' => BUNDLE_ID]);
});

it('expands a collection pasted into the wishlist bulk import', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist/import', ['workshop_ids' => [BUNDLE_ID]])
        ->assertCreated()
        ->assertJson(['added' => [MEMBER_A, MEMBER_B]]);

    $this->assertDatabaseHas('mod_bundles', ['workshop_id' => BUNDLE_ID]);
});

it('rejects installing a workshop id that is not a collection', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/bundles', ['workshop_id' => MEMBER_A, 'target' => 'installed'])
        ->assertStatus(422);

    $this->assertDatabaseCount('mod_bundles', 0);
});

it('passes bundle memberships to the mods page', function () {
    ModBundle::factory()->create(['workshop_id' => BUNDLE_ID]);

    $this->actingAs($this->admin)
        ->get('/admin/mods')
        ->assertInertia(fn ($page) => $page
            ->component('admin/mods')
            ->where('bundles', [BUNDLE_ID => [MEMBER_A, MEMBER_B]])
        );
});

it('uninstalls every mod in a bundle at once, cascading dependents', function () {
    ModBundle::factory()->create(['workshop_id' => BUNDLE_ID]);
    seedWorkshopMod($this->workshopContentPath, MEMBER_A, 'AlphaMod');
    seedWorkshopMod($this->workshopContentPath, MEMBER_B, 'BetaMod');
    seedWorkshopMod($this->workshopContentPath, '7777777777', 'AlphaAddon', ['AlphaMod']);
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'AlphaMod;BetaMod;AlphaAddon',
        'WorkshopItems' => MEMBER_A.';'.MEMBER_B.';7777777777',
    ]);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID.'/mods', ['target' => 'installed'])
        ->assertOk()
        ->assertJson([
            'removed' => [
                'workshop_ids' => [MEMBER_A, MEMBER_B],
                'mod_ids' => ['AlphaMod', 'BetaMod'],
                'cascaded' => ['AlphaAddon'],
            ],
            'restart_required' => true,
        ]);

    $config = (new ServerIniParser)->read($this->iniPath);
    expect($config['Mods'])->not->toContain('AlphaMod')
        ->and($config['Mods'])->not->toContain('BetaMod')
        ->and($config['Mods'])->not->toContain('AlphaAddon')
        ->and($config['WorkshopItems'])->not->toContain(MEMBER_A);
});

it('moves a whole bundle to the wishlist when asked', function () {
    ModBundle::factory()->create(['workshop_id' => BUNDLE_ID]);
    seedWorkshopMod($this->workshopContentPath, MEMBER_A, 'AlphaMod');
    seedWorkshopMod($this->workshopContentPath, MEMBER_B, 'BetaMod');
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'AlphaMod;BetaMod',
        'WorkshopItems' => MEMBER_A.';'.MEMBER_B,
    ]);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID.'/mods', [
            'target' => 'installed',
            'to_wishlist' => true,
        ])
        ->assertOk();

    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => MEMBER_A]);
    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => MEMBER_B]);
    // The grouping survives the move so the wishlist still shows one bundle.
    $this->assertDatabaseHas('mod_bundles', ['workshop_id' => BUNDLE_ID]);
});

it('removes a whole bundle from the wishlist', function () {
    ModBundle::factory()->create(['workshop_id' => BUNDLE_ID]);
    WishlistMod::factory()->create(['workshop_id' => MEMBER_A]);
    WishlistMod::factory()->create(['workshop_id' => MEMBER_B]);
    WishlistMod::factory()->create(['workshop_id' => '4444444444']);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID.'/mods', ['target' => 'wishlist'])
        ->assertOk()
        ->assertJson(['removed' => 2]);

    $this->assertDatabaseCount('wishlist_mods', 1);
});

it('unbundles without touching the mods themselves', function () {
    ModBundle::factory()->create(['workshop_id' => BUNDLE_ID]);
    WishlistMod::factory()->create(['workshop_id' => MEMBER_A]);
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'AlphaMod',
        'WorkshopItems' => MEMBER_A,
    ]);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID)
        ->assertOk()
        ->assertJson(['unbundled' => BUNDLE_ID]);

    $this->assertDatabaseCount('mod_bundles', 0);
    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => MEMBER_A]);
    expect((new ServerIniParser)->read($this->iniPath)['Mods'])->toContain('AlphaMod');
});

it('returns 404 for bundle actions on an untracked collection', function () {
    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID)
        ->assertNotFound();

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID.'/mods', ['target' => 'installed'])
        ->assertNotFound();
});

it('writes audit log entries for bundle actions', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/bundles', ['workshop_id' => BUNDLE_ID, 'target' => 'wishlist'])
        ->assertCreated();
    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/bundles/'.BUNDLE_ID)
        ->assertOk();

    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.bundle.add', 'target' => BUNDLE_ID]);
    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.bundle.unbundle', 'target' => BUNDLE_ID]);
});

it('requires authentication for bundle endpoints', function () {
    $this->postJson('/admin/mods/bundles', ['workshop_id' => BUNDLE_ID, 'target' => 'installed'])
        ->assertUnauthorized();
    $this->deleteJson('/admin/mods/bundles/'.BUNDLE_ID)
        ->assertUnauthorized();
});
