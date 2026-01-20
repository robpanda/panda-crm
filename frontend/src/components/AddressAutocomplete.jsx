import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

/**
 * AddressAutocomplete - Google Places Autocomplete for address fields
 *
 * @param {Object} props
 * @param {string} props.value - Current street address value
 * @param {function} props.onChange - Called with the street address string
 * @param {function} props.onAddressSelect - Called with full address object { street, city, state, postalCode, lat, lng }
 * @param {string} props.placeholder - Input placeholder text
 * @param {string} props.className - Additional CSS classes
 */
export default function AddressAutocomplete({
  value = '',
  onChange,
  onAddressSelect,
  placeholder = 'Start typing an address...',
  className = '',
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);

  // Load Google Places API script
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.warn('Google Maps API key not found (VITE_GOOGLE_MAPS_API_KEY)');
      return;
    }

    // Check if already loaded
    if (window.google?.maps?.places) {
      setIsGoogleLoaded(true);
      initializeServices();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        setIsGoogleLoaded(true);
        initializeServices();
      });
      return;
    }

    // Load the script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setIsGoogleLoaded(true);
      initializeServices();
    };
    script.onerror = () => {
      console.error('Failed to load Google Maps API');
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup debounce on unmount
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Initialize Google Places services
  const initializeServices = useCallback(() => {
    if (window.google?.maps?.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();

      // Create a hidden div for PlacesService (it requires an element)
      const dummyElement = document.createElement('div');
      placesServiceRef.current = new window.google.maps.places.PlacesService(dummyElement);

      // Create a session token for billing optimization
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !inputRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch predictions from Google Places
  const fetchPredictions = useCallback((query) => {
    if (!autocompleteServiceRef.current || !query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input: query,
        componentRestrictions: { country: 'us' },
        types: ['address'],
        sessionToken: sessionTokenRef.current,
      },
      (predictions, status) => {
        setIsLoading(false);

        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions);
          setShowDropdown(true);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Call parent onChange with the string value
    if (onChange) {
      onChange(newValue);
    }

    // Debounce the API call
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (newValue.length >= 3 && isGoogleLoaded) {
      debounceRef.current = setTimeout(() => {
        fetchPredictions(newValue);
      }, 300);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (prediction) => {
    if (!placesServiceRef.current) return;

    setIsLoading(true);
    setShowDropdown(false);

    // Get place details to extract address components
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['address_components', 'formatted_address', 'geometry'],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        setIsLoading(false);

        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          const addressData = parseAddressComponents(place.address_components, place);

          // Update the input with the street address
          setInputValue(addressData.street);

          // Call parent callbacks
          if (onChange) {
            onChange(addressData.street);
          }

          if (onAddressSelect) {
            onAddressSelect(addressData);
          }

          // Create a new session token for next search (billing optimization)
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      }
    );
  };

  // Parse Google address components into our format
  const parseAddressComponents = (components, place) => {
    const result = {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'USA',
      lat: place.geometry?.location?.lat() || null,
      lng: place.geometry?.location?.lng() || null,
    };

    let streetNumber = '';
    let route = '';

    components.forEach((component) => {
      const type = component.types[0];

      switch (type) {
        case 'street_number':
          streetNumber = component.long_name;
          break;
        case 'route':
          route = component.long_name;
          break;
        case 'locality':
          result.city = component.long_name;
          break;
        case 'administrative_area_level_1':
          result.state = component.short_name; // State abbreviation (e.g., "MD")
          break;
        case 'postal_code':
          result.postalCode = component.long_name;
          break;
        case 'country':
          result.country = component.short_name;
          break;
      }
    });

    // Combine street number and route
    result.street = streetNumber && route
      ? `${streetNumber} ${route}`
      : route || streetNumber;

    return result;
  };

  // Clear input
  const handleClear = () => {
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);

    if (onChange) {
      onChange('');
    }

    if (onAddressSelect) {
      onAddressSelect({ street: '', city: '', state: '', postalCode: '', lat: null, lng: null });
    }

    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${className}`}
        />
        {/* Loading indicator or clear button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : inputValue ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectSuggestion(prediction)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-start space-x-3 border-b border-gray-100 last:border-b-0 transition-colors"
            >
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {prediction.structured_formatting?.main_text || prediction.description}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {prediction.structured_formatting?.secondary_text || ''}
                </p>
              </div>
            </button>
          ))}
          {/* Google attribution */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
              alt="Powered by Google"
              className="h-3"
            />
          </div>
        </div>
      )}

      {/* No API key warning */}
      {!isGoogleLoaded && !import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
        <p className="mt-1 text-xs text-amber-600">
          Address autocomplete unavailable - API key not configured
        </p>
      )}
    </div>
  );
}
