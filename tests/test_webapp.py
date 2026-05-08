import unittest

from webapp.server import create_app


class WebappTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def test_health(self) -> None:
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.decode("utf-8"), "ok")

    def test_home(self) -> None:
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"ChemBrain", resp.data)

    def test_condition_page(self) -> None:
        resp = self.client.get("/condition/nsclc_kras_g12c")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"sotorasib", resp.data.lower())


if __name__ == "__main__":
    unittest.main()
