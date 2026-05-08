import unittest
from unittest import mock

from drug_repurposing_engine.catalog import load_catalog
from webapp.server import create_app


class WebAppE2ETests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()

    @mock.patch("webapp.server.requests.get")
    def test_query_proxy_path(self, mock_get):
        mock_response = mock.Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "disease": "pancreatic cancer",
            "source": "cache",
            "candidates": [],
            "warnings": [],
        }
        mock_get.return_value = mock_response

        response = self.client.get("/query?disease=pancreatic%20cancer")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["disease"], "pancreatic cancer")

    @mock.patch("webapp.server.requests.get")
    def test_query_proxy_backend_down(self, mock_get):
        mock_get.side_effect = Exception("backend unavailable")
        response = self.client.get("/query?disease=pancreatic%20cancer")
        self.assertGreaterEqual(response.status_code, 500)

    @mock.patch("drug_repurposing_engine.inference.generate_drug_explanations")
    def test_llm_page_degraded_when_inference_fails(self, mock_generate):
        mock_generate.side_effect = RuntimeError("ollama timed out")
        catalog = load_catalog()
        sample_drug_id = next(iter({entry.drug_id for entry in catalog._drugs.values()}))
        response = self.client.get(f"/drug/{sample_drug_id}?llm=1&refresh=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"LLM generation unavailable", response.data)


if __name__ == "__main__":
    unittest.main()

