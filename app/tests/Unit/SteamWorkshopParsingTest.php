<?php

use App\Services\SteamWorkshopClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

// Needs the framework booted for the Http and Cache facades, which Unit tests
// don't get by default (see tests/Pest.php).
uses(Tests\TestCase::class);

beforeEach(function () {
    Cache::flush();
});

function fakeDescription(string $description): array
{
    Http::fake([
        '*GetPublishedFileDetails*' => Http::response([
            'response' => [
                'publishedfiledetails' => [[
                    'result' => 1,
                    'publishedfileid' => '111',
                    'consumer_app_id' => 108600,
                    'creator_app_id' => 108600,
                    'title' => 'Test',
                    'description' => $description,
                ]],
            ],
        ]),
    ]);

    return (new SteamWorkshopClient)->getDetails('111') ?? [];
}

it('keeps a mod id containing apostrophes, spaces and punctuation', function () {
    // Real description from Frockin Splendor! Vol.1 (3307376332). The old
    // parser stopped at the apostrophe and yielded 'GanydeBielovzki', which
    // matches no mod.info, so PZ silently refused to load the mod.
    $details = fakeDescription("Workshop ID: 3307376332\nMod ID: GanydeBielovzki's Frockin Splendor!");

    expect($details['mod_ids'])->toBe(["GanydeBielovzki's Frockin Splendor!"]);
});

it('keeps a slash-prefixed mod id instead of truncating it to the workshop id', function () {
    // Real description from More Traits (1299328280) — the old parser returned
    // '1299328280', a Workshop ID masquerading as a mod ID.
    $details = fakeDescription("Mod ID: 1299328280/ToadTraits\nMod ID: 1299328280/ToadTraitsDynamic");

    expect($details['mod_ids'])->toBe(['1299328280/ToadTraits', '1299328280/ToadTraitsDynamic']);
});

it('keeps a mod id containing spaces', function () {
    // Diederiks Tile Palooza (2337452747) — old parser gave 'Diederiks'.
    expect(fakeDescription('Mod ID: Diederiks Tile Palooza')['mod_ids'])
        ->toBe(['Diederiks Tile Palooza']);
});

it('does not collapse sibling mods that share an author prefix', function () {
    // The bundle failure mode: two mods truncating to the same string became a
    // single Mods= entry once bulkImport deduplicated them.
    $details = fakeDescription(
        "Mod ID: GanydeBielovzki's Frockin Stompers!\nMod ID: GanydeBielovzki's Frockin Stompers! VFR"
    );

    expect($details['mod_ids'])->toHaveCount(2);
});

it('strips carriage returns from CRLF descriptions', function () {
    expect(fakeDescription("Mod ID: Hydrocraft\r\nSomething else\r\n")['mod_ids'])
        ->toBe(['Hydrocraft']);
});

it('strips bbcode wrapping the line', function () {
    expect(fakeDescription('[b]Mod ID:[/b] TMC_Trolley')['mod_ids'])
        ->toBe(['TMC_Trolley']);
});

it('skips values holding an ini separator rather than corrupting the line', function () {
    // `;` separates entries in Mods= and `=` ends the key, so neither could be
    // written back out.
    expect(fakeDescription("Mod ID: Good\nMod ID: Bad;Injected\nMod ID: Also=Bad")['mod_ids'])
        ->toBe(['Good']);
});

it('keeps a leading build tag, which is part of the mod id not bbcode', function () {
    // `[B42] Tatrapan` is a real mod ID. A greedy bbcode strip eats the `[B42]`
    // and silently produces an ID that loads nothing.
    expect(fakeDescription('Mod ID: [B42] Tatrapan')['mod_ids'])
        ->toBe(['[B42] Tatrapan']);
});

it('still reads a plain single-word mod id', function () {
    expect(fakeDescription('Mod ID: SuperSurvivors')['mod_ids'])->toBe(['SuperSurvivors']);
});

it('reads map folders with spaces', function () {
    expect(fakeDescription('Map Folder: Bedford Falls')['map_folders'])
        ->toBe(['Bedford Falls']);
});

it('accepts the plural Mod IDs label', function () {
    expect(fakeDescription('Mod IDs: SomePack')['mod_ids'])->toBe(['SomePack']);
});

it('deduplicates repeated mod ids', function () {
    expect(fakeDescription("Mod ID: Same\nMod ID: Same")['mod_ids'])->toBe(['Same']);
});

it('ignores a mod id mentioned mid-sentence rather than on its own line', function () {
    // Only `Label: value` at the start of a line counts, so prose can't inject
    // a bogus entry.
    expect(fakeDescription('Please check the Mod ID: field on the page')['mod_ids'])
        ->toBe([])
        ->and(fakeDescription('blah blah Mod ID: Sneaky')['mod_ids'])
        ->toBe([]);
});
