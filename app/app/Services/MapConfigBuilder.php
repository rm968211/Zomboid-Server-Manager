<?php

namespace App\Services;

class MapConfigBuilder
{
    /**
     * Build map configuration from the proxied map.projectzomboid.com tiles.
     *
     * @return array{tileUrl: string, tileSize: int, minZoom: int, maxZoom: int, defaultZoom: int, center: array{x: int, y: int}, dzi: array, source: string}
     */
    public function build(): array
    {
        $proxyDzi = config('zomboid.map.proxy_dzi');
        $w = $proxyDzi['width'];
        $h = $proxyDzi['height'];
        $sqr = $proxyDzi['sqr'];
        $maxNativeZoom = (int) ceil(log(max($w, $h), 2));

        return [
            'tileUrl' => config('zomboid.map.proxy_url'),
            'tileSize' => config('zomboid.map.proxy_tile_size'),
            'minZoom' => config('zomboid.map.min_zoom'),
            'maxZoom' => config('zomboid.map.max_zoom'),
            'defaultZoom' => config('zomboid.map.default_zoom'),
            'center' => [
                'x' => config('zomboid.map.center_x'),
                'y' => config('zomboid.map.center_y'),
            ],
            'dzi' => [
                'width' => $w,
                'height' => $h,
                'x0' => $proxyDzi['x0'],
                'y0' => $proxyDzi['y0'],
                'sqr' => $sqr,
                'maxNativeZoom' => $maxNativeZoom,
                'isometric' => true,
            ],
            'source' => 'proxy',
        ];
    }
}
