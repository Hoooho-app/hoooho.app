import unittest
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("select_xcode", Path(__file__).with_name("select-xcode.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
choose, version_from_output = module.choose, module.version_from_output

class SelectXcodeTests(unittest.TestCase):
    def test_real_version_output(self):
        self.assertEqual(version_from_output("Xcode 26.1\nBuild version 17B55"), (26, 1))
        self.assertEqual(version_from_output("Xcode 16.4\nBuild version 16F6"), (16, 4))
    def test_chooses_supported_install_not_default(self):
        self.assertEqual(choose([("/Applications/Xcode.app/Contents/Developer", "Xcode 16.4"),
                                 ("/Applications/Xcode_26.1.app/Contents/Developer", "Xcode 26.1")]),
                         "/Applications/Xcode_26.1.app/Contents/Developer")
    def test_excludes_beta_and_rejects_old_only(self):
        with self.assertRaises(ValueError):
            choose([("/Applications/Xcode_27_beta.app/Contents/Developer", "Xcode 27.0"),
                    ("/Applications/Xcode.app/Contents/Developer", "Xcode 16.4")])

if __name__ == "__main__":
    unittest.main()
