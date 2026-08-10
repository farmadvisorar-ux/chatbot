import os
import subprocess
import sys
import unittest
from unittest.mock import patch

import requests

from api.weather_api import OpenWeatherMapAPIWrapper, REQUEST_TIMEOUT_SECONDS


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


class ChatbotStartupTests(unittest.TestCase):
    def test_app_starts_in_offline_mode_without_api_keys(self):
        env = os.environ.copy()
        env["OPENAI_API_KEY"] = ""
        env["OPENWEATHERMAP_API_KEY"] = ""

        result = subprocess.run(
            [sys.executable, "-c", "import app; print(app.starting_mode)"],
            cwd=os.path.dirname(os.path.dirname(__file__)),
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "offline")


class WeatherApiResilienceTests(unittest.TestCase):
    @patch("api.weather_api.requests.get")
    def test_empty_location_result_is_reported_without_index_error(self, request):
        request.return_value = FakeResponse([])
        wrapper = OpenWeatherMapAPIWrapper()

        self.assertEqual(wrapper.get_location("missing"), "No matching location found")
        request.assert_called_once()
        self.assertEqual(request.call_args.kwargs["timeout"], REQUEST_TIMEOUT_SECONDS)

    @patch("api.weather_api.requests.get")
    def test_network_failure_is_reported(self, request):
        request.side_effect = requests.Timeout("timed out")
        wrapper = OpenWeatherMapAPIWrapper()

        self.assertIn("Network error: timed out", wrapper.get_location("London"))

    def test_failed_lookup_clears_previous_forecast(self):
        wrapper = OpenWeatherMapAPIWrapper()
        wrapper.location = {"name": "Old city"}
        wrapper.weather = {"daily": [{"temp": {"day": 20}}]}

        with patch.object(wrapper, "get_location", return_value="No matching location found"):
            result = wrapper.get_weather("missing")

        self.assertIn("No matching location found", result)
        self.assertIsNone(wrapper.location)
        self.assertIsNone(wrapper.weather)

    def test_invalid_json_is_reported(self):
        result = OpenWeatherMapAPIWrapper.handle_response(
            FakeResponse(ValueError("not json")),
        )
        self.assertEqual(result, "Invalid response from weather service")

    def test_numeric_precipitation_and_missing_us_state_are_supported(self):
        wrapper = OpenWeatherMapAPIWrapper()
        wrapper.location = {"name": "Washington", "country": "US"}
        wrapper.weather = {
            "timezone_offset": 0,
            "current": {
                "dt": 0,
                "temp": 20,
                "humidity": 50,
                "uvi": 2,
                "clouds": 10,
                "wind_speed": 3,
                "rain": 1.5,
                "snow": 0.25,
                "weather": [{"description": "rain"}],
            },
            "daily": [],
        }

        output = wrapper.get_output()

        self.assertIn("Washington, US", output)
        self.assertIn("1.5 mm/h of rain", output)
        self.assertIn("0.2 mm/h of snow", output)


if __name__ == "__main__":
    unittest.main()
