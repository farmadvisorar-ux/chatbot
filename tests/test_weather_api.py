import unittest
from unittest.mock import Mock, patch

from api.weather_api import OpenWeatherMapAPIWrapper


class OpenWeatherMapAPIWrapperTests(unittest.TestCase):
    def test_get_location_returns_error_for_empty_geocode_response(self):
        response = Mock(status_code=200)
        response.json.return_value = []

        with patch("api.weather_api.requests.get", return_value=response):
            result = OpenWeatherMapAPIWrapper().get_location("Not A Real City")

        self.assertEqual(result, 'no location found for "Not A Real City"')

    def test_get_output_omits_missing_us_state(self):
        wrapper = OpenWeatherMapAPIWrapper()
        wrapper.location = {"name": "Washington", "country": "US"}
        wrapper.weather = {
            "timezone_offset": 0,
            "current": {
                "dt": 0,
                "temp": 20,
                "humidity": 50,
                "uvi": 3,
                "clouds": 10,
                "wind_speed": 4,
                "weather": [{"description": "clear sky"}],
            },
            "daily": [
                {"weather": [{"icon": "01d"}]},
                {
                    "dt": 86400,
                    "summary": "Sunny",
                    "temp": {"morn": 15, "day": 22, "eve": 18, "night": 12},
                    "humidity": 55,
                    "uvi": 4,
                    "clouds": 5,
                    "wind_speed": 3,
                    "pop": 0.1,
                    "weather": [{"description": "sunny"}],
                },
            ],
        }

        output = wrapper.get_output()

        self.assertIn("Location: Washington, US", output)
        self.assertNotIn("Washington, None, US", output)


if __name__ == "__main__":
    unittest.main()
