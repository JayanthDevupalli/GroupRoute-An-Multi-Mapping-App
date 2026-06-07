import * as turf from "@turf/turf";

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Calculates the geographic midpoint (centroid) of a group of coordinates.
 */
export function calculateGravityCenter(locations: Coordinates[]): Coordinates | null {
  if (locations.length === 0) return null;
  if (locations.length === 1) return locations[0];

  const points = turf.featureCollection(
    locations.map(loc => turf.point([loc.lng, loc.lat]))
  );

  const center = turf.center(points);
  const [lng, lat] = center.geometry.coordinates;
  return { lat, lng };
}

/**
 * Fetches a route from OSRM from origin to destination.
 */
export async function fetchRoute(origin: Coordinates, destination: Coordinates, profile: 'driving' | 'walking' | 'cycling' = 'driving') {
  // OSRM expects coordinates in lng,lat format
  const baseUrl = `https://router.project-osrm.org/route/v1/${profile}`;
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${baseUrl}/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      return {
        geometry: data.routes[0].geometry,
        duration: data.routes[0].duration, // in seconds
        distance: data.routes[0].distance  // in meters
      };
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch route:", error);
    return null;
  }
}
