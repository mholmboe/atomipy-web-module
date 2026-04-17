import requests, json

payload = {
    "slabs": [
        {
            "id": "abc",
            "name": "test",
            "source": "uploaded",
            "uploadField": "slabFile_0",
            "position": {"x": 0, "y": 0, "z": 0},
            "replicate": {"x": 1, "y": 1, "z": 1}
        }
    ],
    "box": {"lx": 30, "ly": 30, "lz": 80, "alpha": 90, "beta": 90, "gamma": 90},
    "solvation": {"enabled": True, "waterModel": "spce", "density": 1.0, "limits": None},
    "ions": []
}

files = {
    "request": (None, json.dumps(payload), 'application/json'),
    "slabFile_0": ("test.gro", open("../Pyrophyllite_GII_0.071.gro", "rb"))
}

resp = requests.post("http://127.0.0.1:5002/build_system", files=files)
try:
    print(resp.json()['traceback'])
except Exception as e:
    print("Response wasn't JSON traceback:", resp.text)
