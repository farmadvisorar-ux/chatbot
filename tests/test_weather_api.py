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


if __name__ == "__main__":
    unittest.main()
