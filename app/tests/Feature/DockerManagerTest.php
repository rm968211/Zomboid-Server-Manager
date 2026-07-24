<?php

use App\Services\DockerManager;
use Illuminate\Support\Facades\Http;

it('distinguishes a missing container from a Docker API failure', function () {
    Http::fake([
        'http://docker.test/containers/missing/json' => Http::response([], 404),
        'http://docker.test/containers/broken/json' => Http::response(['message' => 'daemon error'], 500),
    ]);

    $missing = new DockerManager('http://docker.test', 'missing');
    expect($missing->getContainerStatus())
        ->toMatchArray(['exists' => false, 'running' => false, 'status' => 'not_found']);

    $broken = new DockerManager('http://docker.test', 'broken');
    expect(fn () => $broken->getContainerStatus())
        ->toThrow(RuntimeException::class, 'Docker daemon returned HTTP 500');
});

it('does not report a failed Docker action as successful', function () {
    Http::fake([
        'http://docker.test/containers/pz-game-server/start' => Http::response(['message' => 'failed'], 500),
    ]);

    $manager = new DockerManager('http://docker.test', 'pz-game-server');

    expect(fn () => $manager->startContainer())
        ->toThrow(RuntimeException::class, 'Docker daemon returned HTTP 500');
});
