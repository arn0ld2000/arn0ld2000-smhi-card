from pathlib import Path

root = Path(__file__).parent
src = root / "src"
s = (src / "card-source.js").read_text()
sun = (src / "suncalc.js").read_text().split("(function () { 'use strict';", 1)[1].split('// export as Node module', 1)[0]
license_text = (src / "LICENSE-SunCalc.txt").read_text()
s = s.replace("'use strict';", "'use strict';\n/* SunCalc 1.9.0\n" + license_text + "\n*/\nconst SunCalc=(()=>{" + sun + "\nreturn SunCalc;})();", 1)
(root / "arn0ld2000-smhi-card.js").write_text(s)
