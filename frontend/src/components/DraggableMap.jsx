import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Navigation, RefreshCw } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * DraggableMap - Google Maps component with draggable marker
 * Similar to Salesforce's GoogleMapDraggable Visualforce page
 *
 * @param {Object} props
 * @param {number} props.latitude - Initial latitude
 * @param {number} props.longitude - Initial longitude
 * @param {string} props.address - Address to geocode if no lat/lng provided
 * @param {function} props.onLocationChange - Callback when marker is dragged (lat, lng)
 * @param {number} props.height - Map height in pixels (default 400)
 */
const DraggableMap = ({
  latitude,
  longitude,
  address = '',
  onLocationChange,
  height = 400
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentLocation, setCurrentLocation] = useState({
    lat: latitude ? parseFloat(latitude) : null,
    lng: longitude ? parseFloat(longitude) : null,
  });

  // Load Google Maps script
  const loadGoogleMaps = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
        return;
      }

      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.google.maps));
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
  }, []);

  // Geocode address to get coordinates
  const geocodeAddress = useCallback(async (addressStr) => {
    if (!window.google?.maps?.Geocoder) return null;

    const geocoder = new window.google.maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ address: addressStr }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
        } else {
          resolve(null);
        }
      });
    });
  }, []);

  // Initialize map
  const initMap = useCallback(async (maps, lat, lng) => {
    if (!mapRef.current) return;

    const center = { lat, lng };

    // Create map
    mapInstanceRef.current = new maps.Map(mapRef.current, {
      center,
      zoom: 18,
      mapTypeId: 'satellite',
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: maps.ControlPosition.TOP_RIGHT,
        style: maps.MapTypeControlStyle.DROPDOWN_MENU,
      },
      streetViewControl: false,
      fullscreenControl: true,
    });

    // Create draggable marker
    markerRef.current = new maps.Marker({
      position: center,
      map: mapInstanceRef.current,
      draggable: true,
      animation: maps.Animation.DROP,
      title: 'Drag to adjust location',
      icon: {
        url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        scaledSize: new maps.Size(40, 40),
      },
    });

    // Listen for marker drag end
    markerRef.current.addListener('dragend', () => {
      const newPos = markerRef.current.getPosition();
      const newLat = newPos.lat();
      const newLng = newPos.lng();

      setCurrentLocation({ lat: newLat, lng: newLng });

      if (onLocationChange) {
        onLocationChange(newLat, newLng);
      }
    });

    // Listen for map clicks to move marker
    mapInstanceRef.current.addListener('click', (e) => {
      const newLat = e.latLng.lat();
      const newLng = e.latLng.lng();

      markerRef.current.setPosition(e.latLng);
      setCurrentLocation({ lat: newLat, lng: newLng });

      if (onLocationChange) {
        onLocationChange(newLat, newLng);
      }
    });

    setIsLoading(false);
  }, [onLocationChange]);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const maps = await loadGoogleMaps();

        let lat = latitude ? parseFloat(latitude) : null;
        let lng = longitude ? parseFloat(longitude) : null;

        // If no coordinates, try to geocode the address
        if ((!lat || !lng) && address) {
          const geocoded = await geocodeAddress(address);
          if (geocoded) {
            lat = geocoded.lat;
            lng = geocoded.lng;
            setCurrentLocation({ lat, lng });
            if (onLocationChange) {
              onLocationChange(lat, lng);
            }
          }
        }

        // Default to a central US location if nothing else works
        if (!lat || !lng) {
          lat = 39.0;
          lng = -76.5;
        }

        setCurrentLocation({ lat, lng });
        await initMap(maps, lat, lng);
      } catch (err) {
        console.error('Map initialization error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Update marker when lat/lng props change
  useEffect(() => {
    if (markerRef.current && mapInstanceRef.current) {
      const lat = latitude ? parseFloat(latitude) : null;
      const lng = longitude ? parseFloat(longitude) : null;

      if (lat && lng && (lat !== currentLocation.lat || lng !== currentLocation.lng)) {
        const newPos = new window.google.maps.LatLng(lat, lng);
        markerRef.current.setPosition(newPos);
        mapInstanceRef.current.panTo(newPos);
        setCurrentLocation({ lat, lng });
      }
    }
  }, [latitude, longitude]);

  // Recenter map on marker
  const handleRecenter = () => {
    if (mapInstanceRef.current && markerRef.current) {
      const pos = markerRef.current.getPosition();
      mapInstanceRef.current.panTo(pos);
      mapInstanceRef.current.setZoom(18);
    }
  };

  // Get user's current location
  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          if (markerRef.current && mapInstanceRef.current) {
            const newPos = new window.google.maps.LatLng(lat, lng);
            markerRef.current.setPosition(newPos);
            mapInstanceRef.current.panTo(newPos);
            setCurrentLocation({ lat, lng });

            if (onLocationChange) {
              onLocationChange(lat, lng);
            }
          }
        },
        (err) => {
          console.error('Geolocation error:', err);
          setError('Unable to get current location');
        }
      );
    }
  };

  // Re-geocode address
  const handleReGeocode = async () => {
    if (!address) return;

    const geocoded = await geocodeAddress(address);
    if (geocoded) {
      const { lat, lng } = geocoded;

      if (markerRef.current && mapInstanceRef.current) {
        const newPos = new window.google.maps.LatLng(lat, lng);
        markerRef.current.setPosition(newPos);
        mapInstanceRef.current.panTo(newPos);
        setCurrentLocation({ lat, lng });

        if (onLocationChange) {
          onLocationChange(lat, lng);
        }
      }
    }
  };

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-gray-100 rounded-lg border border-gray-300"
        style={{ height }}
      >
        <MapPin className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 text-center px-4">
          Unable to load map: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Map controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRecenter}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Re-center map on marker"
          >
            <MapPin className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Use my current location"
          >
            <Navigation className="w-4 h-4" />
          </button>
          {address && (
            <button
              type="button"
              onClick={handleReGeocode}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Re-geocode address"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500">
          Drag the pin or click to adjust location
        </div>
      </div>

      {/* Map container */}
      <div className="relative rounded-lg overflow-hidden border border-gray-300">
        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10"
            style={{ height }}
          >
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-panda-primary rounded-full animate-spin mb-2" />
              <p className="text-sm text-gray-600">Loading map...</p>
            </div>
          </div>
        )}
        <div
          ref={mapRef}
          style={{ height, width: '100%' }}
        />
      </div>

      {/* Coordinates display */}
      {currentLocation.lat && currentLocation.lng && (
        <div className="flex items-center justify-center space-x-4 text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
          <span>
            <strong>Lat:</strong> {currentLocation.lat.toFixed(6)}
          </span>
          <span>
            <strong>Lng:</strong> {currentLocation.lng.toFixed(6)}
          </span>
        </div>
      )}
    </div>
  );
};

export default DraggableMap;
