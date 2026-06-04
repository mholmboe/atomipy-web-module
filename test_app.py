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

    def test_execute_script_mixed_system_generation(self):
        script = "\n".join(
            [
                "import atomipy as ap",
                "from atomipy.topology import build_topology_from_atoms",
                "import atomipy.write_topology as aw_top",
                "organic_atoms, organic_box = ap.create_grid('Na', 0.5, [0, 0, 0, 2, 2, 2])",
                "clay_atoms, clay_box = ap.create_grid('Cl', 0.5, [0, 0, 0, 2, 2, 2])",
                "merged = ap.join_and_reorder(organic_atoms, clay_atoms)",
                "_top_hub = build_topology_from_atoms(merged, clay_box)",
                "aw_top.write_top(_top_hub, 'mixed_sys.top', split_system=True)",
            ]
        )

        response = self.client.post(
            "/api/execute-script",
            json={
                "script": script,
                "workflow": {"nodes": [], "edges": []},
            },
        )

        self.assert_status(response, 200)
        names = self.zip_names(response)
        self.assertIn("mixed_sys.top", names)


if __name__ == "__main__":
    unittest.main(verbosity=2)
