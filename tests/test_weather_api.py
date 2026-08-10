import unittest
from unittest.mock import Mock, patch

import requests

from api.weather_api import OpenWeatherMapAPIWrapper


class WeatherApiTests(unittest.TestCase):
    def test_empty_geocoding_result_is_reported(self):
        response = Mock(status_code=200)
        response.json.return_value = []

        with patch("api.weather_api.requests.get", return_value=response):
            wrapper = OpenWeatherMapAPIWrapper()
            wrapper.key = "valid-weather-key"

            result = wrapper.get_location("Not A Real City")

        self.assertEqual(result, "Could not find a matching location")

    def test_network_errors_are_reported_without_raising(self):
        with patch(
            "api.weather_api.requests.get",
            side_effect=requests.RequestException("connection reset"),
        ):
            wrapper = OpenWeatherMapAPIWrapper()
            wrapper.key = "valid-weather-key"

            result = wrapper.get_location("Berlin")

        self.assertIn("OpenWeatherMap request failed", result)

    def test_requests_have_a_timeout(self):
        response = Mock(status_code=200)
        response.json.return_value = [{"name": "Berlin", "country": "DE"}]

        with patch("api.weather_api.requests.get", return_value=response) as get:
            wrapper = OpenWeatherMapAPIWrapper()
            wrapper.key = "valid-weather-key"
            wrapper.get_location("Berlin")

        self.assertEqual(get.call_args.kwargs["timeout"], wrapper.REQUEST_TIMEOUT)

    def test_numeric_precipitation_values_are_supported(self):
        self.assertEqual(OpenWeatherMapAPIWrapper._precipitation_amount(0.5), 0.5)
        self.assertEqual(OpenWeatherMapAPIWrapper._precipitation_amount({"1h": 1.25}), 1.25)
        self.assertEqual(OpenWeatherMapAPIWrapper._precipitation_amount(None), 0.0)

    def test_missing_weather_with_summary_present_does_not_crash(self):
        """Regression test: entry with summary but no weather list should be filtered out."""
        wrapper = OpenWeatherMapAPIWrapper()
        wrapper.location = {"name": "Berlin", "country": "DE"}
        wrapper.weather = {
            "current": {
                "dt": 1234567890,
                "temp": 20,
                "humidity": 50,
                "uvi": 3,
                "clouds": 10,
                "wind_speed": 5,
                "weather": [{"description": "clear sky"}]
            },
            "daily": [
                {"dt": 1234567890, "temp": {"morn": 15, "day": 20, "eve": 18, "night": 12},
                 "humidity": 50, "clouds": 10, "wind_speed": 5, "pop": 0.1,
                 "weather": [{"description": "sunny", "icon": "01d"}]},
                {"dt": 1234567891, "temp": {"morn": 15, "day": 20, "eve": 18, "night": 12},
                 "humidity": 50, "clouds": 10, "wind_speed": 5, "pop": 0.1,
                 "summary": "Partly cloudy"},  # Missing weather list
                {"dt": 1234567892, "temp": {"morn": 16, "day": 21, "eve": 19, "night": 13},
                 "humidity": 55, "clouds": 20, "wind_speed": 6, "pop": 0.2,
                 "weather": [{"description": "cloudy", "icon": "02d"}]},
            ],
            "timezone_offset": 0
        }

        # Should not crash when generating output
        try:
            output = wrapper.get_output()
            # Should succeed without raising
            self.assertIsInstance(output, str)
        except (KeyError, IndexError) as e:
            self.fail(f"get_output() crashed with missing weather list: {e}")

        # Normalized entries should exclude the incomplete entry
        normalized = wrapper.get_normalized_daily_entries()
        self.assertEqual(len(normalized), 2)  # Only entries with weather field

    def test_incomplete_entry_between_valid_entries_does_not_misalign_icons(self):
        """Regression test: incomplete entry between valid ones should not misalign icons."""
        wrapper = OpenWeatherMapAPIWrapper()
        wrapper.weather = {
            "daily": [
                {"weather": [{"icon": "01d"}]},
                {"weather": [{"icon": "02d"}]},
                {"summary": "incomplete"},  # No weather field
                {"weather": [{"icon": "03d"}]},
            ]
        }

        normalized = wrapper.get_normalized_daily_entries()
        icons = wrapper.get_icon_ids()

        # Both should have same length (3 entries with weather field)
        self.assertEqual(len(normalized), 3)
        self.assertEqual(len(icons), 3)
        # Icons should match the normalized entries
        self.assertEqual(icons, ["01d", "02d", "03d"])


if __name__ == "__main__":
    unittest.main()
