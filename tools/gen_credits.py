# -*- coding: utf-8 -*-
"""Emits src/data/credits.json.

Run from the repository root:

    python3 tools/gen_credits.py

src/data/credits.json is the file the game loads; this is how it was written.
The roll is a hundred and fifty blocks long, and hand-editing that JSON is how
a department ends up with another department's credits under it. Edit here and
re-run, and the departments stay whole.
"""
import json, io

B = []
def gap(h):      B.append({"kind": "gap", "height": h})
def logo(a, h):  B.append({"kind": "logo", "art": a, "height": h})
def label(t):    B.append({"kind": "label", "text": t})
def heading(t):  B.append({"kind": "heading", "text": t})
def div(t):      B.append({"kind": "division", "text": t})
def note(*l):    B.append({"kind": "note", "lines": list(l)})
def shout(*l):   B.append({"kind": "shout", "lines": list(l)})
def big(t):      B.append({"kind": "big", "text": t})
def names():     B.append({"kind": "names"})
def c(role, name="CORY", accent=None):
    b = {"kind": "credit", "role": role, "name": name}
    if accent: b["accent"] = accent
    B.append(b)

# ------------------------------------------------------------ studio cards
gap(110)
logo("jebusGames", 180)
gap(76)
label("IN COLLABORATION WITH")
gap(76)
logo("cpPlays", 180)
gap(170)

# ---------------------------------------------------- the long run of Cory
div("PRODUCTION")
c("Executive Producer")
c("Associate Executive Producer")
c("Assistant to the Associate Executive Producer")
c("Deadline Enforcement")
c("Deadline Extension")
c("Deadline Extension, Denied")
c("Person Who Said “Just Ship It”")
c("Person Who Said “Not Like That”")
c("Person Who Said It Again, Louder")
c("Line Producer")
c("The Line the Producer Produced")

div("DESIGN")
c("Lead Designer")
c("Designer")
c("Assistant Designer")
c("Assistant to the Assistant Designer")
c("Encounter Designer")
c("Economy Designer")
c("Chief Balance Officer")
c("Deputy Balance Officer")
c("Balance Officer Who Was Overruled")

div("PEANUT LOGISTICS")
c("Chief Peanut Officer")
c("Peanut Supply Chain")
c("Peanut Quality Assurance")
c("Head of Peanut Compliance")
c("Peanut Compliance (Appeals)")
c("Peanut Compliance (Appeals Denied)")
c("Catering")
c("Catering: Peanuts")

div("TOWER PLACEMENT ERGONOMICS")
c("Pad Glow Consultant")
c("Range Circle Review")
c("Range Circle Review, Second Pass")
c("Grid Alignment")
c("Grid Realignment")
c("Tower Placement Ergonomics")
c("Tower Placement Ergonomics (Reshoots)")

div("GNOME AFFAIRS")
c("Gnome Wrangler")
c("Gnome Union Liaison")
c("Second Gnome from the Left")
c("Gnome Path Adherence Officer")
c("Gnome Retrieval")
c("Gnome Retrieval, Unsuccessful")

div("PUNCTUATION")
c("Semicolon Placement")
c("Semicolon Removal")
c("Semicolon Reinstatement")
c("Tabs Versus Spaces Arbitration")
c("Final Sign-Off on the Semicolons")

# ------------------------------------------------ the relief: real credits
div("PROGRAMMING")
c("Lead Programmer", "CLAUDE", "claude")
c("Additional Programming", "CLAUDE", "claude")
c("Off-By-One Error Introduction")
c("Off-By-One Error Correction", "CLAUDE", "claude")
c("Merge Conflict Arbitrator")
c("Merge Conflict Loser")
c("Requirements, Verbal")
c("Requirements, Revised")
c("Requirements, Revised Again")
c("Bug Reports, Filed Loudly")

div("ART DEPARTMENT")
c("Art", "CHATGPT")
c("Early Concept Art", "GEMINI")
c("Assets", "KENNEY — CC0")
note("Projectiles, scenery, fonts and audio. Thank you, Kenney.")
c("Art Direction")
c("Art Redirection")
c("Grass")
c("More Grass")
c("The Path")
c("Cloud Movement")
c("Additional Clouds")

div("SET DRESSING AND CONTINUITY")
c("Filing Cabinet Continuity")
c("Basketball Hoop Placement")
c("Garden Hose Placement")
c("Barbecue Continuity")
c("Clothesline Supervision")
c("Flag Fluttering")
c("SUV Wrangler")
c("Minivan Consultant (Uncredited)")

div("STUNTS AND DAD MODE")
c("DAD MODE Technical Advisor")
c("DAD MODE Stunt Double")
c("Armour Shredding Supervisor")
c("Armour Shredding Supervisor’s Supervisor")
c("Best Boy")
c("Second Best Boy")
c("Third Best Boy, Held in Reserve")
c("Key Grip")
c("Spare Grip")

div("AUDIO")
c("Foley: Peanuts")
c("Foley: Distant Paperwork")
c("Foley: Nearby Paperwork")
c("Additional Rustling")
c("Silence Engineer")
c("Person Who Noticed There Was No Audio")

div("QUALITY ASSURANCE")
c("Lead Game Tester, CP Plays", "COURTLAND")
c("Field Research, Hersheypark Division", "ELI AND HAN")
note("Field research was conducted on location, all day, at Hersheypark.",
     "No findings were submitted. The rides were reportedly excellent.")
c("Wave 7")
c("Wave 8 (Reshoots)")
c("Regression Testing")
c("Regression Reintroduction")
c("Tester Who Found the Bug")
c("Tester Who Ignored It")

div("LEGAL AND COMPLIANCE")
c("Legal")
c("Legal: Footnotes")
c("Footnote Removal")
c("Footnote Reinstatement")
c("Audit Defence")
c("Reminder That Cory Works in Tax, Not Audit")
note("Heroes are named after the family. Cory works in tax.")
c("The Politician: Speech Coach")
c("Percentage Taken")
c("Percentage Returned", "NOBODY")

div("OPERATIONS AND MORALE")
c("Coffee")
c("Coffee (Decaf, Rejected)")
c("Chair")
c("Rubber Duck Operator")
c("Rubber Duck")
c("Cory Wrangler")
c("Cory Wrangler Wrangler")
c("Morale")
c("Morale, Declining")
c("Morale, Restored with Peanuts")
c("Credits Writer")
c("Credits Reader")
c("Person Still Reading the Credits")

# --------------------------------------------------- the close, unchanged
gap(90)
shout("WHY DID YOU SIT THROUGH", "ALL THOSE SELF-AGGRANDIZING", "CREDITS????")
gap(110)
heading("SPECIAL THANKS")
gap(34)
c("Everyone who tapped a glowing pad", "YOU")
c("Hersheypark", "FOR THE RIDES")
c("Kenney", "FOR GIVING IT ALL AWAY")
c("Phaser", "FOR RUNNING IT")
c("Anyone who ever said “you should make a game”", "THIS IS YOUR FAULT")
c("Peanuts", "FOR EVERYTHING")
gap(150)
heading("DEDICATION")
gap(60)
shout("THAT'S IT!")
gap(50)
shout("YOU PEOPLE HAVE STOOD IN MY WAY", "LONG ENOUGH.")
gap(50)
shout("I'M GOING TO CLOWN COLLEGE.")
gap(140)
shout("JUST KIDDING.")
gap(140)
shout("LOVE YOU BOYS.")
gap(240)
names()
gap(64)
big("COURJAHAN")
gap(270)
shout("THIS ONE IS FOR YOU!!")
gap(190)
logo("jebusGames", 200)
gap(260)

data = {
    "scrollSeconds": 90,
    "names": [
        {"lit": "COUR", "rest": "tland"},
        {"pre": "eli", "lit": "JA", "rest": "h"},
        {"lit": "HAN", "rest": ""},
    ],
    "blocks": B,
}
with io.open('src/data/credits.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

cr = [b for b in B if b["kind"] == "credit"]
cory = [b for b in cr if b["name"] == "CORY"]
first_real = next(i for i, b in enumerate(B) if b.get("name") in ("CLAUDE", "CHATGPT", "GEMINI"))
print(f"blocks {len(B)}  credits {len(cr)}  cory {len(cory)} ({len(cory)/len(cr):.0%})")
print(f"divisions {sum(1 for b in B if b['kind']=='division')}")
print(f"first real credit at block {first_real}/{len(B)} ({first_real/len(B):.0%} by count)")
