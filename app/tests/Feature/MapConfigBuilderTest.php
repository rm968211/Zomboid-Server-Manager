<?php

use App\Services\MapConfigBuilder;

it('builds proxy map config', function () {
    $config = (new MapConfigBuilder)->build();

    expect($config['source'])->toBe('proxy')
        ->and($config['tileUrl'])->toContain('/maps/42.19.0/base/layer0_files/')
        ->and($config['dzi'])->toMatchArray([
            'width' => 1157216,
            'height' => 509520,
            'x0' => 518144,
            'y0' => -69648,
            'sqr' => 64,
            'maxNativeZoom' => 21,
            'isometric' => true,
        ]);
});
