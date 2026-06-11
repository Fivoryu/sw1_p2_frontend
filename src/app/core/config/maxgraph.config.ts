import { Client } from '@maxgraph/core';

let configured = false;

/** maxGraph loads UI gifs from Client.imageBasePath; default '.' breaks on deep routes. */
export function configureMaxGraphAssets(): void {
  if (configured) {
    return;
  }
  Client.setImageBasePath('/assets/maxgraph');
  configured = true;
}
