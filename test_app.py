import io
import json
import re
import unittest
import zipfile

from app import app


class AtomipyWebBackendTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def assert_status(self, response, expected):
        payload = response.get_data()
        message = payload[:1000].decode("utf-8", errors="replace")
        self.assertEqual(response.status_code, expected, message)

    def zip_names(self, response):
        payload = response.get_data()
        response.close()
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            return set(zf.namelist())

    def zip_text(self, response, name):
        payload = response.get_data()
        response.close()
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            return zf.read(name).decode("utf-8")

    def test_api_404_returns_json(self):
        response = self.client.get("/api/not-a-real-route")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {"error": "Not found"})

    def test_upload_rejects_unsupported_extension(self):
        response = self.client.post(
            "/api/upload",
            data={"file": (io.BytesIO(b"not a structure"), "payload.exe")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported extension", response.get_json()["error"])

    def test_upload_is_scoped_to_session_storage(self):
        response = self.client.post(
            "/api/upload",
            data={"file": (io.BytesIO(b"ATOM\n"), "payload.pdb")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertRegex(payload["filename"], r"^payload_[a-f0-9]{12}\.pdb$")
        self.assertEqual(payload["path"], f"uploads/{payload['filename']}")
        self.assertIn("atomipy_session=", response.headers.get("Set-Cookie", ""))

    def test_execute_script_uses_current_session_uploads_only(self):
        uploader = app.test_client()
        other_user = app.test_client()

        upload = uploader.post(
            "/api/upload",
            data={"file": (io.BytesIO(b"ATOM\n"), "private.pdb")},
            content_type="multipart/form-data",
        )
        filename = upload.get_json()["filename"]
        script = (
            "import os\n"
            f"open('upload_visible.txt', 'w', encoding='utf-8').write(str(os.path.exists('uploads/{filename}')))\n"
        )

        owner_response = uploader.post("/api/execute-script", json={"script": script})
        outsider_response = other_user.post("/api/execute-script", json={"script": script})

        self.assert_status(owner_response, 200)
        self.assertEqual(self.zip_text(owner_response, "upload_visible.txt"), "True")
        self.assert_status(outsider_response, 200)
        self.assertEqual(self.zip_text(outsider_response, "upload_visible.txt"), "False")

    def test_execute_script_returns_reproducibility_bundle(self):
        script = "\n".join(
            [
                "import atomipy as ap",
                "atoms, box = ap.create_grid('Na', 0.5, [0, 0, 0, 2, 2, 2])",
                "ap.write_pdb(atoms, box, 'quick_system.pdb')",
            ]
        )

        response = self.client.post(
            "/api/execute-script",
            json={
                "script": script,
                "workflow": {"nodes": [], "edges": []},
                "artifacts": {"build_script_strict_minimal.py": script},
            },
        )

        self.assert_status(response, 200)
        names = self.zip_names(response)
        self.assertIn("build_script.py", names)
        self.assertIn("build_script_strict_minimal.py", names)
        self.assertIn("build_summary.json", names)
        self.assertIn("execution_stdout.txt", names)
        self.assertIn("execution_stderr.txt", names)
        self.assertIn("workflow.json", names)
        self.assertIn("quick_system.pdb", names)

    def test_build_stream_caches_downloadable_result(self):
        script = "\n".join(
            [
                "import atomipy as ap",
                "print('__NODE_START__:quick_node:0')",
                "atoms, box = ap.create_grid('Na', 0.5, [0, 0, 0, 2, 2, 2])",
                "ap.write_pdb(atoms, box, 'stream_system.pdb')",
            ]
        )

        response = self.client.post(
            "/api/build-stream",
            json={"script": script, "workflow": {"nodes": [{"id": "quick_node", "type": "ions"}], "edges": []}},
            buffered=True,
        )
        body = response.get_data(as_text=True)
        response.close()
        token_match = re.search(r'"token"\s*:\s*"([^"]+)"', body)

        self.assertEqual(response.status_code, 200)
        self.assertIn('"type": "progress"', body)
        self.assertIn('"type": "complete"', body)
        self.assertIsNotNone(token_match)

        download = self.client.get(f"/api/download-result/{token_match.group(1)}")
        self.assertEqual(download.status_code, 200)
        self.assertIn("stream_system.pdb", self.zip_names(download))

    def test_build_stream_result_download_is_session_scoped(self):
        owner = app.test_client()
        other_user = app.test_client()
        script = "print('__NODE_START__:quick_node:0')\nopen('stream_system.txt', 'w').write('ok')\n"

        response = owner.post(
            "/api/build-stream",
            json={"script": script, "workflow": {"nodes": [{"id": "quick_node", "type": "ions"}], "edges": []}},
            buffered=True,
        )
        body = response.get_data(as_text=True)
        response.close()
        token_match = re.search(r'"token"\s*:\s*"([^"]+)"', body)

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(token_match)
        owner_download = owner.get(f"/api/download-result/{token_match.group(1)}")
        other_download = other_user.get(f"/api/download-result/{token_match.group(1)}")
        self.assertEqual(owner_download.status_code, 200)
        self.assertEqual(other_download.status_code, 404)
        owner_download.close()
        other_download.close()

    def test_build_stream_emits_xrd_plot_payload(self):
        script = "\n".join(
            [
                "import json",
                "payload = {'sourceFile': 'xrd_0_xrd.dat', 'points': [[2.0, 0.0], [10.0, 100.0]]}",
                "print('__XRD_DATA_xrd_node__:' + json.dumps(payload))",
            ]
        )

        response = self.client.post(
            "/api/build-stream",
            json={"script": script, "workflow": {"nodes": [{"id": "xrd_node", "type": "xrd"}], "edges": []}},
            buffered=True,
        )
        body = response.get_data(as_text=True)
        response.close()

        self.assertEqual(response.status_code, 200)
        self.assertIn('"type": "xrd"', body)
        self.assertIn('"nodeId": "xrd_node"', body)
        self.assertIn('"sourceFile": "xrd_0_xrd.dat"', body)

    def test_build_system_route_generates_structure_bundle(self):
        payload = {
            "box": {"lx": 30, "ly": 30, "lz": 80, "alpha": 90, "beta": 90, "gamma": 90},
            "slabs": [
                {
                    "name": "Pyrophyllite",
                    "source": "preset",
                    "presetId": "pyrophyllite",
                    "replicate": {"x": 1, "y": 1, "z": 1},
                    "position": {"x": 0, "y": 0, "z": 0, "mode": "absolute"},
                }
            ],
            "ions": [],
            "solvation": {"enabled": False},
            "postprocess": {"wrap": False},
            "outputFormat": "none",
            "outputName": "smoke_system",
        }

        response = self.client.post("/build_system", json=payload)

        self.assert_status(response, 200)
        names = self.zip_names(response)
        self.assertIn("build_summary.json", names)
        self.assertIn("smoke_system.pdb", names)
        self.assertIn("smoke_system.gro", names)
        self.assertIn("smoke_system.xyz", names)


if __name__ == "__main__":
    unittest.main(verbosity=2)
