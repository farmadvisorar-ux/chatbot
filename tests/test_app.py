import unittest

import app


class AppCallbackTests(unittest.TestCase):
    def test_all_callbacks_are_registered_on_the_dash_app(self):
        self.assertEqual(len(app.app.callback_map), 8)

    def test_enter_submits_without_a_button_click(self):
        questions, cleared_input = app.update_conversation(0, 1, "  What is the weather?  ", [])

        self.assertEqual(questions, ["What is the weather?"])
        self.assertEqual(cleared_input, "")

    def test_empty_submission_preserves_history(self):
        questions, cleared_input = app.update_conversation(None, None, "   ", ["previous"])

        self.assertEqual(questions, ["previous"])
        self.assertEqual(cleared_input, "")

    def test_offline_chat_does_not_mutate_existing_history(self):
        answers = ["previous"]

        result = app.run_chatbot(None, 1, "hello", answers, [1])

        self.assertEqual(result, ["previous", "The weather is nice today!"])
        self.assertEqual(answers, ["previous"])


if __name__ == "__main__":
    unittest.main()
