
import * as THREE from "three";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const USERNAME = "sophiameyers";
const STYLE_ID = "cmw04pvs3008t01p89yal70a0";

const ZOOM = 2;
const TILE_SIZE = 512;
const TILE_COUNT = 2 ** ZOOM;

function loadTile(x, y) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => resolve({ image, x, y });
    image.onerror = () => reject(
      new Error(`Could not load Mapbox tile ${x}, ${y}`)
    );

    image.src =
      `https://api.mapbox.com/styles/v1/${USERNAME}/${STYLE_ID}` +
      `/tiles/512/${ZOOM}/${x}/${y}?access_token=${TOKEN}`;
  });
}

export async function createMapboxTexture() {
  if (!TOKEN || !TOKEN.startsWith("pk.")) {
    throw new Error(
      "Mapbox public token is missing. Check your .env.local file."
    );
  }

  const canvas = document.createElement("canvas");

  canvas.width = TILE_SIZE * TILE_COUNT;
  canvas.height = TILE_SIZE * TILE_COUNT;

  const context = canvas.getContext("2d");

  const requests = [];

  for (let y = 0; y < TILE_COUNT; y++) {
    for (let x = 0; x < TILE_COUNT; x++) {
      requests.push(loadTile(x, y));
    }
  }

  const tiles = await Promise.all(requests);

  for (const tile of tiles) {
    context.drawImage(
      tile.image,
      tile.x * TILE_SIZE,
      tile.y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  texture.needsUpdate = true;

  return texture;
}
