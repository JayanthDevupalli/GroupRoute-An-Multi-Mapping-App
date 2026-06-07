"use client";

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Coordinates } from '../lib/geoUtils';

interface MapCanvasProps {
  center: Coordinates | null;
  users: { id: string, name: string, location: Coordinates }[];
  routeGeoJSON?: any;
}

export default function MapCanvas({ center, users, routeGeoJSON }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});

  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: center ? [center.lng, center.lat] : [-98.5795, 39.8283],
      zoom: center ? 13 : 3
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
  }, []);

  // Update center marker
  useEffect(() => {
    if (!map.current || !center) return;

    let centerMarker = markersRef.current['gravity-center'];
    if (!centerMarker) {
      const el = document.createElement('div');
      el.className = 'w-6 h-6 bg-[--color-target-orange] rounded-full border-2 border-white shadow-lg shadow-black/20';
      
      centerMarker = new maplibregl.Marker({ element: el })
        .setLngLat([center.lng, center.lat])
        .addTo(map.current);
      markersRef.current['gravity-center'] = centerMarker;
    } else {
      centerMarker.setLngLat([center.lng, center.lat]);
    }
    
    // Smoothly pan to new center
    map.current.flyTo({ center: [center.lng, center.lat], zoom: 13, essential: true });
  }, [center]);

  // Update user markers
  useEffect(() => {
    if (!map.current) return;

    users.forEach(user => {
      let marker = markersRef.current[user.id];
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'w-5 h-5 bg-[--color-master-blue] rounded-full border-2 border-white shadow-md';
        
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([user.location.lng, user.location.lat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setText(user.name))
          .addTo(map.current!);
        markersRef.current[user.id] = marker;
      } else {
        marker.setLngLat([user.location.lng, user.location.lat]);
      }
    });

    // We'd also remove markers for users who left, skipped for brevity in this scaffold
  }, [users]);

  // Update route
  useEffect(() => {
    if (!map.current || !routeGeoJSON) return;

    const mapInstance = map.current;
    
    const updateRoute = () => {
      const source = mapInstance.getSource('route') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(routeGeoJSON);
      } else {
        mapInstance.addSource('route', {
          type: 'geojson',
          data: routeGeoJSON
        });
        mapInstance.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#059669', // routeGreen
            'line-width': 4
          }
        });
      }
    };

    if (mapInstance.isStyleLoaded()) {
      updateRoute();
    } else {
      mapInstance.once('load', updateRoute);
    }
  }, [routeGeoJSON]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
}
