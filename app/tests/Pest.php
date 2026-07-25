<?php

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(Tests\TestCase::class)
 // ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * Seed a Workshop content fixture: creates
 * `<path>/<workshopId>/mods/<modId>/mod.info` declaring that mod ID, mirroring
 * how downloaded Workshop content resolves workshop_id in ModManager::list().
 */
function seedWorkshopMod(string $workshopContentPath, string $workshopId, string $modId): void
{
    $modDir = $workshopContentPath.'/'.$workshopId.'/mods/'.$modId;
    mkdir($modDir, 0777, true);
    file_put_contents($modDir.'/mod.info', "id=$modId\nname=$modId\n");
}

function rrmdir(string $dir): void
{
    if (! is_dir($dir)) {
        return;
    }

    foreach (scandir($dir) as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $path = $dir.'/'.$item;
        is_dir($path) ? rrmdir($path) : unlink($path);
    }

    rmdir($dir);
}
