# Basketball Play, Set, Scheme & Action Animation Library

This file is designed as an **animation-ready basketball action dictionary** for an app that visualizes how plays develop, what each player does, how the ball moves, and what tactical advantage the offense or defense is trying to create.

## Animation conventions

- **O1–O5** = offensive players. By default, O1 is the primary ball handler, O2/O3 are guards or wings, and O4/O5 are forwards or bigs. Reassign roles when the play calls for it.
- **X1–X5** = the defender matched to O1–O5 at the beginning of the possession.
- **Ball movement notation:** `O1 → O5` means a pass from O1 to O5.
- **Court zones:** top, left/right slot, left/right wing, left/right corner, left/right elbow, nail, left/right block, dunker spot, short corner, rim.
- **Screen animation:** screener moves to the screening point, comes to a legal stop, cutter/handler uses the screen, then screener executes the next action (roll, pop, slip, seal, rescreen, etc.).
- **Cut animation:** show both the starting location and end location, not only an arrow.
- **Read-based plays:** animate the base route first, then branch the visualization when the user selects the defensive response/read.
- **Timing:** screens, cuts, and passes should be sequenced by phase rather than all moving at once unless the play specifically uses simultaneous action.
- **Default orientation:** offense attacks the basket at the top of the visual. Mirror every play horizontally so the app can run it on either side.

## Suggested animation phases

1. **Setup** – players move into the starting formation.
2. **Entry** – first pass, dribble, or trigger.
3. **Primary action** – main screen, cut, handoff, post entry, or isolation.
4. **Secondary action** – roll, pop, flare, split, relocation, or screen-the-screener.
5. **Read** – offense reacts to the defense.
6. **Result** – shot, drive, pass, post touch, reset, or continuation.

---

# 1. Offensive formations / starting alignments

These are mostly **setup states**. The animation sequence describes how to place players into the structure before a play starts.

### 5-Out

- **Type:** Formation
- **Starting alignment:** O1 top; O2/O3 slots or wings; O4/O5 corners or opposite slots
- **Animation sequence:**
  1. O1 brings the ball to the top.
  2. O2 and O3 widen to opposite slots/wings.
  3. O4 and O5 lift or drift until all five players are outside the paint.
  4. Finish with the lane completely open and roughly equal spacing between adjacent players.
- **Primary goal:** Create maximum driving, cutting, handoff, and screening space.

### 4-Out 1-In

- **Type:** Formation
- **Starting alignment:** Four players outside; one post/dunker player inside
- **Animation sequence:**
  1. O1 settles at the top or slot.
  2. O2 and O3 occupy opposite wings/corners.
  3. O4 spaces to the remaining perimeter location.
  4. O5 establishes a block, mid-post, or dunker-spot position.
  5. Keep the ball-side driving gap open whenever possible.
- **Primary goal:** Blend perimeter spacing with a permanent interior scoring/rebounding threat.

### 3-Out 2-In

- **Type:** Formation
- **Starting alignment:** Three perimeter players; two interior players
- **Animation sequence:**
  1. O1 sets at the top.
  2. O2 and O3 space to opposite wings.
  3. O4 and O5 occupy opposite blocks, high-low, or one block plus one elbow.
  4. Interior players maintain vertical or diagonal separation.
- **Primary goal:** Create high-low, cross-screen, post-up, and interior rebounding options.

### 1-4 High

- **Type:** Formation
- **Starting alignment:** O1 above the arc; O2-O5 aligned near free-throw-line extended
- **Animation sequence:**
  1. O1 dribbles to the top.
  2. O2 and O3 widen near the wings/free-throw-line extended.
  3. O4 and O5 fill the two elbow/high-post areas.
  4. Keep the baseline and rim area empty before the first cut.
- **Primary goal:** Open the paint for backdoors, UCLA cuts, elbow entries, and isolations.

### 1-4 Low

- **Type:** Formation
- **Starting alignment:** O1 above the arc; O2-O5 aligned low across the baseline
- **Animation sequence:**
  1. O1 centers the ball above the arc.
  2. O2 and O3 move to the two corners/short-corner area.
  3. O4 and O5 align near the two blocks.
  4. Leave the entire upper half-court clear for O1.
- **Primary goal:** Create a large isolation lane and hide later baseline screening.

### Horns

- **Type:** Formation
- **Starting alignment:** O1 top; O4/O5 at elbows; O2/O3 corners
- **Animation sequence:**
  1. O1 brings the ball to the top.
  2. O4 and O5 step to left and right elbows.
  3. O2 and O3 flatten to opposite corners.
  4. Pause with O1 centered between the two possible screeners.
- **Primary goal:** Present two symmetric screening/passing options from one recognizable shell.

### Horns High

- **Type:** Formation
- **Starting alignment:** Horns with O4/O5 higher and wider
- **Animation sequence:**
  1. O1 reaches the top.
  2. O4 and O5 move above the elbows toward the slots.
  3. O2 and O3 stay in deep corners.
  4. Create a wider gap between each screener and the lane.
- **Primary goal:** Increase drive space and create higher ball-screen angles.

### Horns Low

- **Type:** Formation
- **Starting alignment:** Horns with O4/O5 lower than normal elbows
- **Animation sequence:**
  1. O1 holds top.
  2. O4 and O5 settle between elbow and block level.
  3. O2 and O3 remain in corners.
  4. Keep O4/O5 staggered enough to avoid clogging the lane.
- **Primary goal:** Improve post seals, elbow dives, and interior screen angles.

### Double High

- **Type:** Formation
- **Starting alignment:** Two high screeners/posts above elbows
- **Animation sequence:**
  1. O1 centers above the arc.
  2. O4 and O5 move to opposite high-screen positions.
  3. O2 and O3 flatten to the corners or low wings.
- **Primary goal:** Give O1 a choice of two screens and create roll/pop combinations.

### Double Low

- **Type:** Formation
- **Starting alignment:** Two low posts plus three perimeter players
- **Animation sequence:**
  1. O1 takes the top.
  2. O2/O3 space to wings.
  3. O4/O5 occupy opposite low blocks.
  4. Keep the middle of the lane clear enough for cross screens.
- **Primary goal:** Create post entries, cross screens, and baseline movement.

### Box

- **Type:** Formation
- **Starting alignment:** Four players form a rectangle around the lane
- **Animation sequence:**
  1. Place O2 and O3 at the two elbows.
  2. Place O4 and O5 at the two blocks.
  3. O1 starts outside the formation with the ball or as inbounder.
  4. Freeze briefly so users can see the box shape.
- **Primary goal:** Hide which player will screen, cut, or receive the ball.

### Diamond

- **Type:** Formation
- **Starting alignment:** One top, two side players, one low player around lane
- **Animation sequence:**
  1. Place O2 at the top/nail area.
  2. Place O3 and O4 at opposite elbows/short wings.
  3. Place O5 near the rim or low block.
  4. O1 starts with the ball outside the diamond.
- **Primary goal:** Create multiple shooter exits and screening angles.

### Vertical Stack

- **Type:** Formation
- **Starting alignment:** Three or four players stacked vertically
- **Animation sequence:**
  1. Align O2-O5 in a straight or nearly straight line from block toward elbow/top.
  2. Keep one-step spacing between adjacent players.
  3. O1 starts with ball/inbound outside the stack.
- **Primary goal:** Conceal assignments and allow players to break in opposite directions.

### Horizontal Stack

- **Type:** Formation
- **Starting alignment:** Players stacked side-by-side horizontally
- **Animation sequence:**
  1. Align O2-O5 across the lane/baseline or free-throw-line extended.
  2. Position defenders so matchups are visually compressed.
  3. O1 waits outside the stack with the ball.
- **Primary goal:** Create crossing routes and difficult switch communication.

### Double Stack

- **Type:** Formation
- **Starting alignment:** Two pairs stacked on opposite sides
- **Animation sequence:**
  1. O2 and O4 form one stack on the left.
  2. O3 and O5 form a second stack on the right.
  3. O1 holds the ball at top or inbound spot.
  4. Both stacks stay still until the trigger.
- **Primary goal:** Create simultaneous two-player screening threats.

### Line

- **Type:** Formation
- **Starting alignment:** Three or four players in one straight line
- **Animation sequence:**
  1. O2-O5 align shoulder-to-shoulder or front-to-back depending on play.
  2. O1 holds or inbounds the ball.
  3. At the trigger, players can break in multiple directions.
- **Primary goal:** Obscure the target and screening responsibilities.

### Four Across

- **Type:** Formation
- **Starting alignment:** Four players spread in one horizontal line
- **Animation sequence:**
  1. O2-O5 spread across baseline or free-throw-line extended.
  2. Equalize gaps between each player.
  3. O1 holds the ball away from the line.
- **Primary goal:** Create simultaneous cuts, screens, and isolation clear-outs.

### Spread

- **Type:** Formation
- **Starting alignment:** Maximum-width perimeter spacing
- **Animation sequence:**
  1. O1 controls the ball at top/wing.
  2. Two teammates move to deep corners.
  3. Two teammates widen to opposite slot/wing areas.
  4. Any interior player vacates the paint.
- **Primary goal:** Reduce help proximity and maximize isolation/P&R space.

### Empty Corner

- **Type:** Formation
- **Starting alignment:** Ball-side corner intentionally vacant
- **Animation sequence:**
  1. O1 moves to a wing or slot.
  2. O2/O3/O4 occupy the opposite corner, opposite wing, and top/weak slot.
  3. O5 approaches as screener.
  4. Leave the ball-side corner completely empty.
- **Primary goal:** Remove the nearest low helper from a side ball screen.

### Empty Side

- **Type:** Formation
- **Starting alignment:** Only two offensive players occupy the ball side
- **Animation sequence:**
  1. O1 dribbles to a side slot/wing.
  2. O5 moves to screen or post on the same side.
  3. O2/O3/O4 clear to the opposite half of the floor.
  4. Maintain enough weak-side spacing to discourage help.
- **Primary goal:** Create a pure two-man game with minimal immediate help.

### Overload

- **Type:** Formation
- **Starting alignment:** Three or four offensive players occupy one side
- **Animation sequence:**
  1. Move the ball to a wing.
  2. Place one player in the corner, one at short corner/block, and one at high post/slot on that same side.
  3. Keep only one offensive player opposite.
- **Primary goal:** Create a local numerical advantage against zone or help defense.

### High-Low

- **Type:** Formation
- **Starting alignment:** One big high, one big low
- **Animation sequence:**
  1. O4 moves to an elbow/high-post spot.
  2. O5 seals on the opposite or same-side block.
  3. Three perimeter players space around them.
  4. Keep a direct passing lane from O4 to O5 available.
- **Primary goal:** Create interior passing over or around fronting defenders.

### Dunker Alignment

- **Type:** Formation
- **Starting alignment:** One player occupies dunker spot beside rim
- **Animation sequence:**
  1. O1 and perimeter players create four-out spacing.
  2. O5 settles just outside the lane along the baseline.
  3. O5 shifts opposite the ball when needed to preserve the driving lane.
- **Primary goal:** Maintain rim pressure without placing the big directly in the driving lane.

### Short-Corner Alignment

- **Type:** Formation
- **Starting alignment:** Interior player in short corner
- **Animation sequence:**
  1. Perimeter players stretch the zone.
  2. O5 moves to baseline 8–12 feet from the rim.
  3. O5 mirrors the ball from short corner to short corner as required.
- **Primary goal:** Pull the rim protector away from the basket and create baseline passing angles.

### Delay Alignment

- **Type:** Formation
- **Starting alignment:** Big at top as 5-out hub
- **Animation sequence:**
  1. O5 trails to the top with the ball or receives O1 → O5.
  2. O1 cuts or clears after the pass.
  3. O2/O3 occupy corners or wings.
  4. O4 fills the remaining perimeter slot.
- **Primary goal:** Use the big as a passing/handoff hub while keeping the paint open.

### Pistol Alignment

- **Type:** Formation
- **Starting alignment:** Ball handler on side, guard near corner, big trailing
- **Animation sequence:**
  1. O1 advances to right or left wing.
  2. O2 fills the near corner or lower wing.
  3. O5 trails toward the side slot.
  4. O3/O4 space weak side.
- **Primary goal:** Launch quick three-player early-offense actions.

### Princeton Alignment

- **Type:** Formation
- **Starting alignment:** High-post facilitator with four-out spacing
- **Animation sequence:**
  1. O5 establishes high post or top.
  2. O1/O2 occupy guard spots.
  3. O3/O4 space to wings/corners.
  4. Keep backdoor lanes open behind overplaying defenders.
- **Primary goal:** Enable backdoors, split cuts, and high-post reads.

### Flex Alignment

- **Type:** Formation
- **Starting alignment:** Four perimeter/interior spots arranged for baseline flex cuts
- **Animation sequence:**
  1. Place one player in each corner/low block area.
  2. Place two players high/slot.
  3. Ball begins at a high guard spot.
  4. Keep the opposite baseline lane available for the flex cutter.
- **Primary goal:** Create repeating baseline cuts and screen-the-screener sequences.

### Triangle Alignment

- **Type:** Formation
- **Starting alignment:** Strong-side triangle plus two weak-side players
- **Animation sequence:**
  1. Place one player in strong-side corner.
  2. Place one player on strong-side wing.
  3. Place one post on strong-side block.
  4. Place two players in weak-side guard/wing spots.
- **Primary goal:** Create post entry, spacing, split, and weak-side two-man-game options.

---

# 2. Offensive systems / set families

### 5-Out Motion

- **Type:** Offensive system
- **Starting alignment:** 5-Out
- **Animation sequence:**
  1. O1 passes to O2 on a wing.
  2. O1 cuts through the lane to the rim.
  3. If O1 is not open, O1 exits to the opposite corner.
  4. O3/O4/O5 rotate one spot to replace the vacated perimeter location.
  5. The next passer repeats pass-cut-replace or screens away.
  6. Continue until a backdoor, drive, handoff, or open shot appears.
- **Primary goal:** Create repeated defensive movement while preserving maximum spacing.
- **Common reads / branches:**
  - If denied, backdoor instead of receiving.
  - If defender helps in the lane, replace for an open three.
  - If switch-prone defense, flow into guard-guard screens.

### 4-Out Motion

- **Type:** Offensive system
- **Starting alignment:** 4-Out 1-In
- **Animation sequence:**
  1. O1 passes to a wing and cuts or screens away.
  2. Perimeter players rotate to fill vacated spots.
  3. O5 posts, flashes, or moves from block to short corner based on ball location.
  4. On penetration, weak-side perimeter players drift/lift while O5 relocates opposite the drive.
  5. Reset to four-out spacing after each failed action.
- **Primary goal:** Combine drive-and-kick with an interior target and offensive rebounding.

### Pass-and-Cut Motion

- **Type:** Offensive system
- **Starting alignment:** Usually 4-Out or 5-Out
- **Animation sequence:**
  1. Ball handler passes to adjacent perimeter teammate.
  2. Passer immediately cuts hard to the rim.
  3. If not passed the ball, cutter exits to the opposite side.
  4. Nearest teammate fills the vacated spot.
  5. Repeat on every perimeter pass.
- **Primary goal:** Punish ball watching and denial with repeated rim cuts.

### Pass-and-Screen-Away Motion

- **Type:** Offensive system
- **Starting alignment:** 4-Out or 5-Out
- **Animation sequence:**
  1. O1 passes to O2.
  2. O1 turns away from the ball and screens O3.
  3. O3 chooses curl, straight cut, flare, or backdoor.
  4. O1 opens to the ball after screening.
  5. Weak-side players replace to preserve spacing.
  6. Continue the same rule on the next pass.
- **Primary goal:** Create constant off-ball screening without needing a called play.

### Read-and-React

- **Type:** Offensive system
- **Starting alignment:** 5-Out or 4-Out
- **Animation sequence:**
  1. Start in spacing shell.
  2. On any pass, passer cuts or screens based on team rule.
  3. On penetration, perimeter players circle, lift, or drift to maintain passing windows.
  4. On post entry, adjacent players split or relocate.
  5. On denial, receiver backcuts.
  6. Return to spacing after the advantage ends.
- **Primary goal:** Let players react to defender position instead of following one fixed route.

### Dribble Drive Motion

- **Type:** Offensive system
- **Starting alignment:** 4-Out/5-Out with wide gaps
- **Animation sequence:**
  1. O1 attacks a gap off the dribble.
  2. Nearest corner player drifts or lifts depending on drive direction.
  3. Opposite wing slides into a kick-out window.
  4. Interior/dunker player moves opposite the drive.
  5. If O1 is stopped, O1 pitches to a perimeter teammate.
  6. New ball handler immediately attacks the next closeout.
- **Primary goal:** Create continuous paint touches and drive-kick-drive sequences.

### Princeton Offense

- **Type:** Offensive system
- **Starting alignment:** Princeton/4-Out 1-High
- **Animation sequence:**
  1. Enter the ball to O5 at high post or top.
  2. Guards exchange or cut around O5.
  3. If a defender overplays, cutter goes backdoor.
  4. If no backdoor is available, O5 hands off or passes to a wing.
  5. Weak-side players screen, split, or fill behind the action.
  6. Continue into Point, Chin, Low, or open spacing.
- **Primary goal:** Punish denial and use a skilled passing big as the offensive hub.

### Princeton Chin

- **Type:** Offensive system/set
- **Starting alignment:** Princeton alignment
- **Animation sequence:**
  1. O1 passes to O2 on the wing.
  2. O1 cuts toward the basket using a back screen from O5 near the elbow.
  3. O2 looks for O1 at the rim.
  4. If O1 is not open, O1 clears to the opposite corner.
  5. O5 can then flare-screen O3 or receive the ball for a handoff.
  6. Continue into a second-side action.
- **Primary goal:** Create an immediate backdoor/rim threat, then flow into perimeter screening.

### Princeton Point

- **Type:** Offensive system/set
- **Starting alignment:** 5-Out/Princeton with O5 top
- **Animation sequence:**
  1. O1 passes to O5 at the top.
  2. O1 cuts or screens away.
  3. O2 and O3 read their defenders around O5.
  4. Run an Away, Over, or Under cut around the high-post hub.
  5. O5 delivers the pass, DHO, or backdoor feed based on the defender.
  6. Players replace into 5-out spacing.
- **Primary goal:** Generate several reads from the same high-post entry so defense cannot sit on one route.

### Flex Offense

- **Type:** Continuity offense
- **Starting alignment:** Flex alignment
- **Animation sequence:**
  1. O1 passes from top to O2.
  2. Weak-side corner O3 uses a baseline flex screen from O5 and cuts across the lane.
  3. O1 moves down to screen O5's defender.
  4. O5 uses O1's down screen and rises to the top/wing.
  5. O2 reverses the ball to O5.
  6. The same pattern repeats on the opposite side.
- **Primary goal:** Produce a repeating layup/post cut followed by screen-the-screener perimeter action.

### Shuffle Offense

- **Type:** Continuity offense
- **Starting alignment:** 3-Out/2-In or shuffle alignment
- **Animation sequence:**
  1. Ball is entered to a guard/wing.
  2. Opposite perimeter player cuts diagonally through the lane using a screen.
  3. Interior player screens or seals to open the diagonal route.
  4. Cutter looks for a post catch or clears through.
  5. Remaining players rotate to restore spacing.
  6. Reverse the ball and repeat the shuffle on the other side.
- **Primary goal:** Create diagonal rim/post cuts and continuous screening.

### Swing Offense

- **Type:** Continuity offense
- **Starting alignment:** 4-Out 1-In / interchangeable
- **Animation sequence:**
  1. Reverse the ball from one side to the other.
  2. Passer screens away or cuts through.
  3. Perimeter players interchange guard and wing spots.
  4. Interior player posts, flashes, or sets cross screens.
  5. Attack a closeout or post mismatch created by the reversals.
  6. If no advantage, reverse again and repeat.
- **Primary goal:** Move the defense side-to-side until a post entry, drive, or open shot appears.

### Triangle Offense

- **Type:** Offensive system
- **Starting alignment:** Strong-side triangle
- **Animation sequence:**
  1. O1 passes to strong-side wing O2 and cuts to corner or opposite side.
  2. O5 establishes strong-side post position.
  3. O2 reads post entry, corner pass, or baseline cut.
  4. If O5 receives, O1/O2 can split, cut, or relocate around the post.
  5. Weak-side O3/O4 run two-man action or prepare reversal.
  6. If strong side is denied, reverse into weak-side action.
- **Primary goal:** Maintain spacing around a post hub and create read-based counters instead of one predetermined shot.

### Blocker-Mover

- **Type:** Offensive system
- **Starting alignment:** Two designated screeners, three movers
- **Animation sequence:**
  1. Assign O4/O5 as blockers and O1/O2/O3 as movers.
  2. Movers continuously change sides using down, flare, and stagger screens.
  3. Blockers hold screening positions, then re-screen as cutters change direction.
  4. Ball reverses to follow the best moving shooter.
  5. When defense top-locks, mover backcuts.
  6. When defenders switch, blocker seals the mismatch.
- **Primary goal:** Create repeated high-value movement shots for elite shooters while keeping screeners in useful positions.

### Continuity P&R

- **Type:** Continuity offense
- **Starting alignment:** Spread or 4-Out
- **Animation sequence:**
  1. O1 runs side or middle P&R with O5.
  2. If no advantage, O1 reverses to O2.
  3. O5 exits or repositions to screen O2.
  4. Weak-side players rotate to restore spacing.
  5. O2 runs the next P&R on the opposite side.
  6. Repeat until a drive, roll, pop, or rotation is created.
- **Primary goal:** Force the defense to execute ball-screen coverage repeatedly in one possession.

### Continuity DHO

- **Type:** Continuity offense
- **Starting alignment:** 5-Out/Delay
- **Animation sequence:**
  1. O5 holds at top and hands off to O1.
  2. O1 attacks briefly, then moves the ball to the next perimeter player.
  3. O5 follows the pass and sets up the next handoff.
  4. Receivers can turn the corner, reject, or return the ball.
  5. Continue around the perimeter until a defender loses contact or switches.
- **Primary goal:** Create moving catches and repeated screen-like exchanges without stopping the ball.

### Delay Offense

- **Type:** Offensive system
- **Starting alignment:** Delay / 5-Out
- **Animation sequence:**
  1. O1 advances and passes to trailing O5 at the top.
  2. O1 cuts through or receives a Get handoff.
  3. O2 and O3 exchange, backcut, or run Zoom on either side.
  4. O5 reads handoff, backdoor, or direct pass.
  5. If no advantage, reverse through O5 and run the action opposite.
- **Primary goal:** Exploit a passing big, empty the paint, and flow between DHOs, cuts, and ball screens.

### Horns Series

- **Type:** Set family
- **Starting alignment:** Horns
- **Animation sequence:**
  1. Set in Horns.
  2. O1 chooses an elbow entry, ball screen, or pass to a horn.
  3. The non-used horn dives, pops, screens away, or becomes a second screener.
  4. Corners stay spaced until their defender helps.
  5. Flow into Twist, Spain, Flare, Zoom, UCLA, or High-Low.
- **Primary goal:** Hide multiple distinct plays behind the same starting alignment.

### Pistol / 21 Series

- **Type:** Set family
- **Starting alignment:** Pistol alignment
- **Animation sequence:**
  1. O1 advances on the sideline.
  2. O2 moves toward O1 for a pitch, handoff, or Get exchange.
  3. O5 trails into a ball-screen position.
  4. O3/O4 space weak side.
  5. After the guard exchange, O1/O2 either attack immediately or use O5's screen.
  6. Continue into P&R, flare, backdoor, or Delay.
- **Primary goal:** Create a fast three-player attack before half-court defenders establish matchups.

### Zoom Series

- **Type:** Set family
- **Starting alignment:** Corner/wing receiver plus screener and handoff big
- **Animation sequence:**
  1. O2 begins low in corner/wing.
  2. O4 sets a pindown for O2.
  3. O2 comes off the screen toward O5.
  4. O5 hands the ball to O2.
  5. O2 turns the corner while O4/O5 roll, pop, or rescreen depending on version.
  6. Weak side spaces for kick-outs.
- **Primary goal:** Put the receiver in motion before the handoff so the on-ball defender begins behind the play.

---

# 3. Core offensive actions

### Give-and-Go

- **Type:** Atomic action
- **Starting alignment:** O1 top/wing with O2 one pass away
- **Animation sequence:**
  1. O1 passes to O2.
  2. Immediately after releasing the pass, O1 cuts hard behind X1 toward the rim.
  3. O2 pivots to face the cutter.
  4. If O1 is open, O2 → O1 for the finish.
  5. If denied, O1 exits to the opposite corner and O2 keeps the ball.
- **Primary goal:** Exploit a defender who relaxes or turns their head after the pass.

### Backdoor Cut

- **Type:** Atomic action
- **Starting alignment:** Receiver denied on wing/slot
- **Animation sequence:**
  1. O2 steps toward the ball as if trying to receive.
  2. When X2 overplays the passing lane, O2 plants and cuts behind X2 to the rim.
  3. O1 delivers a bounce, lob, or lead pass into the lane.
  4. If the help closes, O2 continues through and exits opposite.
- **Primary goal:** Punish denial pressure and overplaying.

### 45 Cut

- **Type:** Atomic action
- **Starting alignment:** O2 on 45-degree wing; ball drives from opposite/top
- **Animation sequence:**
  1. O1 drives into the paint.
  2. X2 turns attention toward the ball or tags a roller.
  3. O2 cuts diagonally from wing toward front of rim.
  4. O1 hits O2 before the help recovers.
  5. If pass is unavailable, O2 continues through to the opposite side.
- **Primary goal:** Attack the space vacated by a help defender.

### UCLA Cut

- **Type:** Atomic action
- **Starting alignment:** O1 top, O2 wing, O5 high post
- **Animation sequence:**
  1. O1 passes to O2 on the wing.
  2. O5 sets a back screen on X1 near the elbow.
  3. O1 cuts tightly off O5 toward the rim.
  4. O2 looks for the layup/lob.
  5. If not open, O1 posts briefly or clears to the opposite corner.
  6. O5 opens to the ball for the next action.
- **Primary goal:** Create a rim cut by screening the passer's defender from behind.

### Zipper Cut

- **Type:** Atomic action
- **Starting alignment:** O2 starts at block/low wing; O5 near elbow
- **Animation sequence:**
  1. O2 begins low near the block.
  2. O5 sets a down/vertical screen on X2.
  3. O2 sprints straight up the lane line toward the slot/top.
  4. O1 passes to O2 at the top.
  5. O5 opens or turns into a ball screen after the catch if the play continues.
- **Primary goal:** Move a primary creator from a low starting spot to a clean catch at the top.

### Iverson Cut

- **Type:** Atomic action
- **Starting alignment:** O2 on one wing/corner; O4/O5 at elbows
- **Animation sequence:**
  1. O4 and O5 establish screening positions near both elbows.
  2. O2 cuts horizontally across the floor above the free-throw line.
  3. O2 uses O4 then O5, or the screens in the opposite order depending on direction.
  4. O1 times the pass so O2 catches on the opposite wing.
  5. O4/O5 immediately dive, pop, or prepare the next screen.
- **Primary goal:** Move a scorer across the court while forcing the defender through multiple high screens.

### Flex Cut

- **Type:** Atomic action
- **Starting alignment:** O3 corner, O5 near opposite block
- **Animation sequence:**
  1. O5 sets a baseline/cross screen on X3.
  2. O3 cuts across the lane toward the opposite block/rim.
  3. Ball handler looks for O3 inside.
  4. If no pass, O3 clears to the opposite corner or post.
  5. O5 prepares to receive a screen-the-screener action.
- **Primary goal:** Generate a layup/post catch and set up the next continuity screen.

### Curl Cut

- **Type:** Atomic action
- **Starting alignment:** Shooter uses pindown/stagger
- **Animation sequence:**
  1. Screener sets a legal screen on the cutter's defender.
  2. Cutter approaches as if exiting to the perimeter.
  3. Cutter plants and turns tightly around the screener toward the lane.
  4. Pass arrives into the curl path.
  5. Cutter finishes, pulls up, or hits help-side teammate.
- **Primary goal:** Punish a defender who trails tightly behind the cutter.

### Flare Cut

- **Type:** Atomic action
- **Starting alignment:** Cutter near slot/wing; screener inside
- **Animation sequence:**
  1. Screener positions inside the defender.
  2. Cutter steps toward the ball, then cuts away from it behind the screen.
  3. Ball handler skips or leads the pass toward the open perimeter area.
  4. Screener opens toward the basket or slips if switched.
- **Primary goal:** Create separation for a perimeter catch when the defender plays high or toward the ball.

### Dive

- **Type:** Atomic action
- **Starting alignment:** High-post/perimeter big
- **Animation sequence:**
  1. O5 begins above the lane or at elbow.
  2. On the trigger pass or drive, O5 cuts directly to the rim.
  3. O5 seals the recovering defender on the inside shoulder.
  4. Ball handler looks for lob, pocket, or dump-off.
  5. If not open, O5 exits to dunker spot.
- **Primary goal:** Create immediate vertical rim pressure and open space behind the dive.

### Duck-In

- **Type:** Atomic action
- **Starting alignment:** Big near lane line or short corner
- **Animation sequence:**
  1. Ball reverses from one side to the other.
  2. As X5 turns to see the new ball side, O5 steps across X5's body.
  3. O5 seals with back/hip and presents target hands.
  4. Perimeter passer feeds O5 immediately before help arrives.
- **Primary goal:** Create a deep post catch using timing rather than a stationary post-up.

---

# 4. Pick-and-roll and ball-screen plays

### Basic Pick-and-Roll

- **Type:** Ball-screen play
- **Starting alignment:** O1 top/wing, O5 approaching as screener
- **Animation sequence:**
  1. O5 sprints or walks into screening position on X1.
  2. O1 sets X1 up with one or two dribbles.
  3. O1 dribbles shoulder-to-hip off O5's screen.
  4. O5 pivots and rolls to the rim.
  5. O1 reads X5: finish if X5 stays back, pass to O5 if X5 commits, or kick out if a helper tags.
  6. Weak-side players maintain spacing or relocate behind help.
- **Primary goal:** Force X1 and X5 to defend two offensive players in connected space.
- **Common reads / branches:**
  - Handler score.
  - Roll pass.
  - Weak-side kick-out.
  - Short roll if X5 shows high.

### Pick-and-Pop

- **Type:** Ball-screen play
- **Starting alignment:** O1 + shooting O5
- **Animation sequence:**
  1. O5 sets the on-ball screen.
  2. O1 uses it and drives away from O5.
  3. Instead of rolling, O5 opens and moves backward/outward to the arc.
  4. If X5 protects the lane, O1 passes back to O5.
  5. If defense switches, O1 may attack the big while O5 relocates.
- **Primary goal:** Pull the screener defender away from the rim and create a perimeter shot.

### Pick-and-Slip

- **Type:** Ball-screen play
- **Starting alignment:** O1 + screener vs aggressive coverage
- **Animation sequence:**
  1. O5 approaches as if setting a normal screen.
  2. Before contact, O5 plants and cuts directly to the rim.
  3. O1 keeps X1 occupied with the dribble.
  4. O1 passes early into O5's slip window.
  5. Weak-side players lift/drift if their defenders collapse.
- **Primary goal:** Punish switching, hedging, or defenders who jump the screen before contact.

### Short Roll

- **Type:** Ball-screen play
- **Starting alignment:** P&R vs show/blitz
- **Animation sequence:**
  1. O5 screens for O1.
  2. O1 uses the screen and draws both X1/X5 high.
  3. O5 releases into the nail/free-throw-line area instead of rolling to the rim.
  4. O1 passes to O5 in the middle.
  5. O5 catches facing the basket in a 4-on-3 situation.
  6. O5 reads finish, lob/dump-off, 45 cut, or corner kick-out.
- **Primary goal:** Create a central playmaking advantage behind aggressive ball-screen coverage.

### Side Pick-and-Roll

- **Type:** Ball-screen play
- **Starting alignment:** O1 on wing, O5 inside/slot
- **Animation sequence:**
  1. O1 dribbles to the wing.
  2. O5 sets a screen angled toward the middle.
  3. O1 uses the screen toward the center of the floor.
  4. O5 rolls toward rim.
  5. Ball-side corner either stays, lifts, or clears depending on play.
  6. O1 reads middle help and weak-side tag.
- **Primary goal:** Force the defense to choose between keeping the ball on the side and protecting the middle.

### Step-Up Pick-and-Roll

- **Type:** Ball-screen play
- **Starting alignment:** O1 on wing, O5 sets baseline-oriented screen
- **Animation sequence:**
  1. O5 approaches from the baseline side and sets screen with angle that opens the middle.
  2. O1 attacks over the screen toward the center.
  3. O5 rolls down the sideline-side lane line or directly to rim.
  4. Ball-side corner clears or lifts.
  5. O1 reads X5 and low help.
- **Primary goal:** Beat sideline pressure and turn a side possession into a middle attack.

### Flat Pick-and-Roll

- **Type:** Ball-screen play
- **Starting alignment:** O1 top, O5 flat near top
- **Animation sequence:**
  1. O5 sets a screen with back roughly toward the rim, giving O1 either direction.
  2. O1 pauses to make X1 declare a side.
  3. O1 attacks left or right off O5.
  4. O5 opens and rolls down the middle.
  5. Spacers hold corners and wings.
- **Primary goal:** Make the ball defender guess and open both directions from a central screen.

### Empty-Corner Pick-and-Roll

- **Type:** Ball-screen play
- **Starting alignment:** O1 side slot, O5 screener, ball-side corner empty
- **Animation sequence:**
  1. Clear the ball-side corner before the screen arrives.
  2. O5 sets a side/angle screen for O1.
  3. O1 turns the corner toward the paint.
  4. O5 rolls into the now-open lane.
  5. Weak-side low defender must travel farther to tag.
  6. O1 reads roller, rim, or skip pass.
- **Primary goal:** Remove the closest tag defender and increase the space available to the roller.

### Double Drag

- **Type:** Ball-screen play
- **Starting alignment:** Transition; O4 and O5 trail
- **Animation sequence:**
  1. O1 pushes the ball up the middle.
  2. O4 sets the first drag screen.
  3. O5 follows immediately with a second screen.
  4. O1 uses both screens in sequence.
  5. First screener usually pops or short-rolls.
  6. Second screener usually rolls hard.
  7. O1 reads pull-up, pop, roll, or weak-side kick-out.
- **Primary goal:** Create two simultaneous frontcourt threats before defenders establish half-court matchups.

### Re-Screen / Twist

- **Type:** Ball-screen play
- **Starting alignment:** Initial P&R already underway
- **Animation sequence:**
  1. O5 sets the first screen for O1.
  2. O1 uses or partially uses it.
  3. As X1 recovers to one side, O5 quickly changes body angle.
  4. O5 sets a second screen back in the opposite direction.
  5. O1 changes direction and attacks the new lane.
  6. O5 rolls or pops after the second screen.
- **Primary goal:** Exploit the ball defender's momentum and force the big to change coverage direction.

### Reject the Screen

- **Type:** Ball-screen counter
- **Starting alignment:** O1 approaches planned screen
- **Animation sequence:**
  1. O5 arrives to screen one side of X1.
  2. O1 dribbles toward the screen to sell usage.
  3. When X1 jumps over or shades toward the screen, O1 crosses back and attacks the opposite gap.
  4. O5 slips, rolls, or turns to seal X1/X5.
  5. Corner player drifts to create a baseline passing window.
- **Primary goal:** Punish a defender who commits too early to the screen.

### Inverted Pick-and-Roll

- **Type:** Ball-screen play
- **Starting alignment:** Big/wing handler with guard as screener
- **Animation sequence:**
  1. O4/O5 controls the ball at top or wing.
  2. O1/O2, a smaller player, sets the screen.
  3. Handler uses the screen toward preferred driving side.
  4. Small screener pops, slips, or relocates.
  5. Defense must decide whether to switch a smaller defender onto the big handler or keep coverage.
- **Primary goal:** Force unusual matchups and exploit a big creator against smaller defenders.

### Spain Pick-and-Roll

- **Type:** Compound ball-screen play
- **Starting alignment:** O1 handler, O5 ball screener, O2 third screener
- **Animation sequence:**
  1. O5 sets a normal ball screen on X1.
  2. O1 uses the screen while O5 rolls hard to the rim.
  3. As X5 prepares to contain O1 or track O5, O2 back-screens X5.
  4. O5 continues through the screen toward the rim.
  5. O2 immediately pops to the arc after the back screen.
  6. O1 reads lob/roll first, O2 pop second, own drive third, weak-side kick-out fourth.
- **Primary goal:** Create a simultaneous rim and three-point threat that overloads the screener defender.
- **Common reads / branches:**
  - If defense switches all three, attack the weakest mismatch.
  - If X2 helps on O5, hit O2 on the pop.
  - If X5 stays with O5, O1 can turn the corner.

### Spain Slip

- **Type:** Spain variation
- **Starting alignment:** Standard Spain spacing
- **Animation sequence:**
  1. Begin normal Spain P&R.
  2. O2 approaches X5 as if setting the back screen.
  3. Before contact, O2 slips toward the rim or open lane.
  4. O5 can short roll or occupy X5.
  5. O1 reads whichever cutter becomes free.
- **Primary goal:** Punish teams that pre-switch or overreact to the expected Spain back screen.

### Ram Pick-and-Roll

- **Type:** Compound ball-screen play
- **Starting alignment:** O1 handler; O5 future ball screener; O4 ram screener
- **Animation sequence:**
  1. Before O5 reaches O1, O4 sets an off-ball screen on X5.
  2. O5 uses O4's screen to sprint into the ball-screen position.
  3. O4 pops or clears after the ram screen.
  4. O5 immediately screens O1.
  5. O1 uses the ball screen while X5 is late or detached.
  6. O5 rolls; O1 reads roll, pop, or drive.
- **Primary goal:** Prevent X5 from arriving cleanly to the ball screen and disrupt planned coverage.

### Ghost Screen

- **Type:** Ball-screen deception
- **Starting alignment:** Perimeter-capable screener
- **Animation sequence:**
  1. O2/O4 approaches O1 as if setting an on-ball screen.
  2. Before making contact, screener plants and sprints away to open perimeter space.
  3. O1 attacks the gap created by the defenders' communication hesitation.
  4. If defenders switch anyway, O1 passes to the ghosting shooter.
  5. If they stay attached, O1 drives against a briefly off-balance defender.
- **Primary goal:** Create confusion between switch/stay responsibilities without using a real screen.

### Ram Ghost

- **Type:** Compound deception
- **Starting alignment:** Ram setup into ghost
- **Animation sequence:**
  1. O4 screens X5 away from O5.
  2. O5 sprints toward O1 as if becoming the ball screener.
  3. Before contact, O5 ghosts out to the perimeter.
  4. O1 attacks the vacated driving lane.
  5. O4 can slip to rim or relocate after the ram screen.
  6. Read O5 pop, O4 slip, or O1 drive.
- **Primary goal:** Layer two false screening cues to force communication errors.

### Zipper Pick-and-Roll

- **Type:** Compound play
- **Starting alignment:** O2 low, O5 high, O1 ball
- **Animation sequence:**
  1. O2 starts near the block.
  2. O5 screens O2 vertically up the lane.
  3. O2 zipper-cuts to the top and receives O1 → O2.
  4. O5 immediately pivots from the zipper screen into an on-ball screen for O2.
  5. O2 attacks the P&R before X2 can fully recover.
  6. O5 rolls or pops.
- **Primary goal:** Give the primary creator a catch in motion and immediately make the recovering defender navigate another screen.

### Iverson Pick-and-Roll

- **Type:** Compound play
- **Starting alignment:** O2 crosses over elbow screens
- **Animation sequence:**
  1. O4/O5 set elbow-area screens.
  2. O2 Iverson-cuts from one side to the other.
  3. O1 passes to O2 on the catch.
  4. One of O4/O5 follows O2 into a side ball screen.
  5. The other big dives, pops, or clears.
  6. O2 attacks the ball screen with the defense already shifted.
- **Primary goal:** Move the defense laterally before initiating the primary ball screen.

### P&R + 45 Cut

- **Type:** Compound play
- **Starting alignment:** Spread P&R with weak-side wing
- **Animation sequence:**
  1. O1/O5 run P&R.
  2. Weak-side low defender X2/X3 steps toward the roller.
  3. The corresponding wing O2/O3 immediately 45-cuts to the rim behind that help.
  4. O1 passes to the cutter if open.
  5. If the cutter draws the rim defender, O5 may become available behind the play.
- **Primary goal:** Directly punish the low man's tag on the roller.

### P&R + Shake

- **Type:** Compound play
- **Starting alignment:** Spread P&R with weak-side corner/wing
- **Animation sequence:**
  1. O1/O5 run P&R.
  2. Weak-side defender sinks to tag O5.
  3. Weak-side shooter lifts from corner toward wing/slot behind the tag.
  4. O1 skips or throws back to the lifting shooter.
  5. Shooter catches before the tag defender can recover.
- **Primary goal:** Create a perimeter passing window behind roller help.

### P&R → Hammer

- **Type:** Compound play
- **Starting alignment:** Side P&R leading to baseline drive
- **Animation sequence:**
  1. O1 and O5 run side P&R.
  2. O1 turns the corner and continues toward baseline.
  3. On the weak side, O4 sets a back/flare screen on X3.
  4. O3 moves from wing toward weak-side corner.
  5. O1 makes a baseline skip pass to O3.
  6. O5 occupies rim defenders with the roll.
- **Primary goal:** Convert baseline help into an open weak-side corner three.

---

# 5. Handoff, Zoom/Chicago, and Pistol actions

### Basic Dribble Handoff

- **Type:** Handoff play
- **Starting alignment:** O5 ball at top/wing; O2 approaches
- **Animation sequence:**
  1. O5 dribbles toward O2.
  2. O2 sets up X2 with a step away, then cuts tightly toward O5.
  3. O5 stops or slows and presents the ball on the outside hip.
  4. O2 takes the ball hand-to-hand and turns the corner.
  5. O5 pivots to screen X2 during the exchange.
  6. O5 then rolls, pops, or re-screens.
- **Primary goal:** Transfer the ball while simultaneously creating screening contact so the receiver catches at speed.

### Get / Give-and-Get

- **Type:** Handoff play
- **Starting alignment:** O1 ball, O5/O2 receiver
- **Animation sequence:**
  1. O1 passes to O5.
  2. Immediately after the pass, O1 runs toward O5.
  3. O5 pivots to protect the ball and prepares the handoff.
  4. O1 takes the handoff moving downhill.
  5. O5 screens O1's defender and then rolls or pops.
- **Primary goal:** Return the ball to the original creator with momentum after changing the defender's angle.

### Keep

- **Type:** DHO counter
- **Starting alignment:** O5 appears ready to hand off
- **Animation sequence:**
  1. O2 runs toward O5 for the DHO.
  2. X2 jumps high to chase or deny O2.
  3. O5 fakes extending the ball for the handoff.
  4. O5 keeps the ball and turns toward the vacated lane.
  5. O2 continues through to occupy help or becomes a backdoor target.
- **Primary goal:** Punish defenders who overplay the handoff receiver.

### DHO Reject / Backdoor

- **Type:** DHO counter
- **Starting alignment:** Receiver denied above the handoff
- **Animation sequence:**
  1. O2 approaches O5 as if taking handoff.
  2. X2 positions above O2 to deny the route.
  3. O2 plants and cuts behind X2 toward the rim.
  4. O5 keeps the ball and hits O2 with a bounce/lob pass.
  5. If the pass is unavailable, O2 clears through and O5 attacks.
- **Primary goal:** Turn handoff denial into a direct rim cut.

### Chicago / Zoom

- **Type:** Compound handoff play
- **Starting alignment:** O2 corner/low wing, O4 pindown screener, O5 ball handler/handoff hub
- **Animation sequence:**
  1. O4 sets a pindown on X2.
  2. O2 uses the pindown and rises toward the wing.
  3. O5 dribbles toward O2.
  4. O2 flows directly from the pindown into a DHO with O5.
  5. O2 turns the corner downhill.
  6. O4 can pop, O5 can roll, and weak-side players remain spaced.
- **Primary goal:** Put O2's defender behind the play before O2 receives the handoff.

### Corner Zoom

- **Type:** Zoom variation
- **Starting alignment:** Receiver begins deep corner
- **Animation sequence:**
  1. O2 starts in the corner.
  2. O4 screens X2 from inside the lane/wing.
  3. O2 sprints up toward O5.
  4. O5 delivers DHO.
  5. O2 attacks the large gap between the corner and top.
  6. O4 slips or pops depending on help.
- **Primary goal:** Maximize runway and acceleration for the handoff receiver.

### Double Zoom

- **Type:** Compound handoff play
- **Starting alignment:** Two sides prepared for Zoom
- **Animation sequence:**
  1. Run Zoom for O2 on one side.
  2. If no advantage, O2 moves the ball back to O5/top.
  3. O3 on the opposite side now receives a pindown from O4.
  4. O3 flows into a second DHO.
  5. The offense attacks before the defense can reset from the first Zoom.
- **Primary goal:** Force the defense to chase identical movement actions on consecutive sides.

### Zoom → Pick-and-Roll

- **Type:** Compound play
- **Starting alignment:** Standard Zoom
- **Animation sequence:**
  1. Run pindown → DHO for O2.
  2. As O2 completes the handoff, O4 or O5 immediately changes angle into an on-ball screen.
  3. O2 uses the second screen without pausing.
  4. The second screener rolls.
  5. Original handoff partner pops, clears, or occupies help.
  6. O2 reads drive, roll, or kick-out.
- **Primary goal:** Make the same defender navigate an off-ball screen, handoff, and ball screen in rapid succession.

### Miami Action

- **Type:** Compound play
- **Starting alignment:** DHO receiver plus second ball screener
- **Animation sequence:**
  1. O5 hands the ball to O2.
  2. O2 turns the corner off the DHO.
  3. A second player O4 immediately sets a ball screen for O2.
  4. O2 uses O4's screen.
  5. O4 rolls while O5 spaces or short-rolls into open area.
  6. Weak side stays spread.
- **Primary goal:** Stack a handoff and a true ball screen to create a second defensive decision before recovery.

### Pistol / 21

- **Type:** Early-offense set
- **Starting alignment:** O1 side handler, O2 near corner, O5 trailing
- **Animation sequence:**
  1. O1 advances the ball to the wing.
  2. O2 rises from the corner toward O1.
  3. O1 pitches or hands the ball to O2, or uses a Get exchange.
  4. O5 arrives as the trailing screener.
  5. O2 immediately uses O5's ball screen.
  6. O1 clears, flares, or becomes a return option.
  7. O3/O4 hold weak-side spacing.
- **Primary goal:** Create a quick three-player side attack before defenders organize.

### Pistol Keep

- **Type:** Pistol counter
- **Starting alignment:** Standard Pistol setup
- **Animation sequence:**
  1. O2 approaches for the pitch/handoff.
  2. X2 anticipates the exchange.
  3. O1 fakes the transfer and keeps the ball.
  4. O5 still arrives as a screen or seals help.
  5. O1 attacks the newly opened baseline/middle lane.
  6. O2 continues through to clear.
- **Primary goal:** Exploit defenders who jump the expected guard exchange.

### Pistol Backdoor

- **Type:** Pistol counter
- **Starting alignment:** O2 denied on approach
- **Animation sequence:**
  1. O2 starts to rise for the Pistol exchange.
  2. X2 top-locks or denies the route.
  3. O2 plants and cuts backdoor toward rim.
  4. O1 hits O2 if open.
  5. If the backdoor is covered, O5 flows directly into side P&R with O1.
- **Primary goal:** Punish aggressive denial while preserving the original ball-screen option.

### Pistol → Delay

- **Type:** Flow action
- **Starting alignment:** Pistol early offense
- **Animation sequence:**
  1. Begin the Pistol exchange on one side.
  2. If no advantage, reverse the ball to trailing O5 at the top.
  3. O1/O2 clear into 5-out spots.
  4. O5 becomes the Delay hub.
  5. Continue into Get, Zoom, backdoor, or opposite-side DHO.
- **Primary goal:** Transition smoothly from early offense into organized half-court action without resetting.

---

# 6. Off-ball screening and shooter plays

### Pindown

- **Type:** Off-ball screen
- **Starting alignment:** O2 low/corner, O5 inside
- **Animation sequence:**
  1. O5 moves into a stationary screen between X2 and the desired catch area.
  2. O2 walks or jabs away to set up X2.
  3. O2 cuts tightly off O5 toward the wing/slot.
  4. O1 passes to O2 as O2 clears the screen.
  5. O5 opens to the ball, slips, or seals if X5 helps.
- **Primary goal:** Free a shooter/creator for a moving catch.

### Wide Pindown

- **Type:** Off-ball screen
- **Starting alignment:** Shooter corner; screener near elbow/inside lane
- **Animation sequence:**
  1. O5 sets the screen farther from O2 than a normal pindown.
  2. O2 sprints into the screen with more horizontal/vertical runway.
  3. O2 chooses straight, curl, or reject route.
  4. Ball arrives as O2 gains speed into the catch.
  5. O5 dives or pops after contact.
- **Primary goal:** Create a larger driving gap and more speed for the receiver.

### Flare Screen

- **Type:** Off-ball screen
- **Starting alignment:** O2 slot/wing; O5 inside
- **Animation sequence:**
  1. O2 steps toward the ball or toward the middle.
  2. O5 screens the defender from the inside.
  3. O2 cuts away from the ball toward open wing/corner space.
  4. Ball handler throws a skip or overhead pass.
  5. O5 slips toward the rim if defenders switch.
- **Primary goal:** Free a perimeter shooter away from the ball and stretch help defense.

### Cross Screen

- **Type:** Off-ball screen
- **Starting alignment:** O4/O5 opposite sides of lane
- **Animation sequence:**
  1. O4 moves across the lane and screens X5.
  2. O5 cuts behind the screen from one block to the other.
  3. Perimeter passer waits for O5 to establish inside position.
  4. Pass enters O5 on the new block.
  5. O4 exits or receives a screen-the-screener action.
- **Primary goal:** Create deeper post position or a rim catch.

### Screen-the-Screener

- **Type:** Compound off-ball action
- **Starting alignment:** Any first screen followed by second
- **Animation sequence:**
  1. O4 sets the first screen for O2.
  2. As O2 uses the screen, O4's defender turns attention toward O2.
  3. O5 immediately screens X4.
  4. O4 uses O5's screen to cut to the rim or perimeter.
  5. Ball handler reads O2 first, O4 second.
- **Primary goal:** Exploit the moment when the first screener's defender is occupied helping on the initial action.

### Stagger

- **Type:** Off-ball screen
- **Starting alignment:** Shooter low; two screeners in path
- **Animation sequence:**
  1. O4 and O5 establish two consecutive screening points.
  2. O2 sets up X2 and begins the route.
  3. O2 uses O4's screen first.
  4. Without stopping, O2 uses O5's second screen.
  5. O1 passes to O2 at the exit point.
  6. O4/O5 open, slip, or screen again.
- **Primary goal:** Force the defender through multiple screens and create a clean movement shot.

### Floppy / Single-Double

- **Type:** Shooter set
- **Starting alignment:** Shooter under rim; one screen on one side, double/stagger on other
- **Animation sequence:**
  1. O2 starts near the restricted area/baseline.
  2. One side sets a single screen; the opposite side forms a double/stagger.
  3. O2 reads X2 and chooses the better exit.
  4. O2 runs through the chosen screen group.
  5. O1 delivers the pass to the wing/corner.
  6. If X2 top-locks the exit, O2 backcuts toward the rim.
- **Primary goal:** Let the shooter choose the route that best punishes the defender's positioning.

### Elevator

- **Type:** Shooter set
- **Starting alignment:** Two screeners separated near lane/top; shooter below
- **Animation sequence:**
  1. O4 and O5 stand a few feet apart with an open gate between them.
  2. O2 cuts upward through the gap.
  3. Immediately after O2 passes between them, O4 and O5 step together and close the gate.
  4. X2 is sealed behind the two screeners.
  5. O1 passes to O2 for the shot.
- **Primary goal:** Create a brief wall between the shooter and defender for a clean perimeter catch.

### Hammer

- **Type:** Weak-side action
- **Starting alignment:** Ball handler driving baseline; weak-side shooter on wing; screener inside
- **Animation sequence:**
  1. O1 drives hard along the baseline.
  2. Weak-side O4 sets a back/flare screen on X3.
  3. O3 moves behind O4 toward the deep weak-side corner.
  4. O1 keeps the dribble below the backboard to draw help.
  5. O1 throws a baseline skip pass to O3.
  6. O4 can slip to the rim if defenders switch.
- **Primary goal:** Punish baseline help by creating an open weak-side corner three.

### Rip Screen

- **Type:** Off-ball backscreen action
- **Starting alignment:** O2/O3 perimeter, O4/O5 inside
- **Animation sequence:**
  1. O4 sets a hard back screen on a perimeter defender.
  2. Target cutter O2 cuts toward the rim.
  3. Ball handler looks for the lob/layup.
  4. If the cut is covered, O4 opens to receive the ball or flow into a handoff.
  5. The cutter clears to maintain spacing.
- **Primary goal:** Create a quick rim threat and force the defense to collapse before the next action.

### Wiper

- **Type:** Compound off-ball action
- **Starting alignment:** Shooter and screener pair
- **Animation sequence:**
  1. O4 sets a flare screen for O2 away from the ball.
  2. O2 uses or threatens the flare.
  3. O4 immediately changes direction and sets a cross/down screen back the other way.
  4. O2 reverses direction through the second screen.
  5. Ball handler passes to whichever exit becomes free.
- **Primary goal:** Force a defender to reverse direction through two different screen angles.

---

# 7. Named multi-player sets and common play families

### Horns Twist

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. O1 dribbles toward O5's elbow screen.
  2. O5 sets the first ball screen.
  3. O1 uses it toward one side.
  4. O4 moves behind/around O1 and changes the screening angle.
  5. O1 reverses direction and uses O4's second screen.
  6. O5 rolls or clears; O4 rolls/pops after the second screen.
  7. Corners remain spaced.
- **Primary goal:** Force the on-ball defender and both big defenders to change direction in rapid sequence.

### Horns Flare

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. O1 passes to O5 at an elbow.
  2. O4 moves across and sets a flare screen for O2 or O3.
  3. The shooter cuts away from the ball to the wing/corner.
  4. O5 looks for the flare pass.
  5. If denied, O1 receives a handoff/ball screen from O5.
  6. O4 slips or seals after screening.
- **Primary goal:** Create a weak-side three while preserving a secondary two-man game.

### Horns Dive

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. O1 dribbles toward one horn as if using a ball screen.
  2. Opposite horn O4 dives hard to the rim.
  3. Screen-side horn O5 sets the actual ball screen.
  4. O1 uses O5 and attacks.
  5. O4 occupies the low help defender at the rim/dunker spot.
  6. O1 reads drive, O5 roll/pop, or O4 dump-off.
- **Primary goal:** Clear one high-post area while creating simultaneous ball-screen and rim pressure.

### Horns Spain

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. Set in Horns.
  2. O5 steps up to ball-screen O1.
  3. O4 dives or shifts into position behind X5.
  4. O1 uses O5's screen.
  5. O5 rolls.
  6. O4 back-screens X5 and then pops.
  7. O2/O3 stay in corners.
- **Primary goal:** Disguise Spain P&R inside a familiar Horns shell.

### Horns Zoom

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. O1 passes to O5 at an elbow and clears slightly.
  2. O4 sets a pindown for corner player O2.
  3. O2 rises off O4's screen toward O5.
  4. O5 hands the ball to O2.
  5. O2 attacks downhill.
  6. O4 rolls/pops and O5 opens or re-screens.
- **Primary goal:** Use Horns to hide a Chicago/Zoom handoff sequence.

### Horns UCLA

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. O1 passes to O2 on the wing.
  2. Ball-side horn O5 sets a back screen on X1.
  3. O1 UCLA-cuts to the rim.
  4. O2 looks for O1.
  5. If no pass, O1 clears and O5 receives O2 → O5.
  6. Opposite horn O4 can screen away or run DHO with O2/O3.
- **Primary goal:** Create an early rim cut, then continue into elbow facilitation.

### Horns High-Low

- **Type:** Set play
- **Starting alignment:** Horns
- **Animation sequence:**
  1. O1 enters the ball to O4 at the elbow.
  2. O5 dives from opposite elbow to the low block/rim.
  3. O4 turns and looks high-low to O5.
  4. If X5 fronts O5, O4 throws over the top.
  5. If help collapses, O4 kicks to a corner shooter.
  6. O1 relocates for a return pass.
- **Primary goal:** Use the two elbow players to create direct interior high-low passing.

### Box Zipper

- **Type:** Set play
- **Starting alignment:** Box
- **Animation sequence:**
  1. O2 starts at a low block in the box.
  2. O5 steps upward to set a vertical screen.
  3. O2 zipper-cuts to the top.
  4. O1 passes to O2.
  5. Opposite box players O3/O4 exchange or clear.
  6. O5 immediately follows with ball screen or rolls after the catch.
- **Primary goal:** Free the primary creator from a low starting position into a clean central catch.

### Box Elevator

- **Type:** Set play
- **Starting alignment:** Box
- **Animation sequence:**
  1. O2 starts low inside the box.
  2. O4/O5 move into two-door elevator positions near the top.
  3. O2 cuts through the gap.
  4. O4/O5 close together after O2 clears.
  5. O1 passes to O2.
  6. O3 clears to prevent help.
- **Primary goal:** Use the compact box alignment to disguise an elevator shot.

### Diamond Pindown

- **Type:** Set play
- **Starting alignment:** Diamond
- **Animation sequence:**
  1. O2 starts as low point of diamond.
  2. O4/O5 occupy side screening spots.
  3. O1/O3 space top/side depending on entry.
  4. O2 chooses one side and uses a pindown.
  5. Ball handler passes to O2 on the wing.
  6. Opposite side clears or runs a secondary flare.
- **Primary goal:** Free a shooter from a concealed central starting position.

### Diamond Backdoor

- **Type:** Set counter
- **Starting alignment:** Diamond
- **Animation sequence:**
  1. Set the same diamond shell.
  2. O2 begins to use the pindown exit.
  3. If X2 jumps above/top-locks the route, O2 plants and cuts directly to the rim.
  4. Ball handler throws the backdoor pass.
  5. Screeners turn to seal help.
- **Primary goal:** Punish denial against the expected diamond shooter exit.

### Stack Slip

- **Type:** Set counter
- **Starting alignment:** Vertical/horizontal stack
- **Animation sequence:**
  1. Two offensive players align close together.
  2. Front player O4 steps out as if setting a screen for O2.
  3. As defenders prepare to switch, O4 slips toward the rim.
  4. O2 cuts opposite or pops outward.
  5. Ball handler chooses the slip or outside receiver.
- **Primary goal:** Exploit switch communication created by compressed stack alignment.

### Post Split

- **Type:** Set action
- **Starting alignment:** Post entry with two perimeter players above/around post
- **Animation sequence:**
  1. O1 passes into O5 on the block.
  2. O1 immediately screens for O2 or cuts across O2.
  3. O2 reads the screen and cuts to the rim or perimeter.
  4. O5 holds the ball and reads both cutters.
  5. If neither is open, O5 attacks the post matchup.
  6. Weak-side players stay spaced.
- **Primary goal:** Punish post doubles and ball watching with coordinated perimeter movement.

### Elbow Split

- **Type:** Set action
- **Starting alignment:** O5 catches at elbow; O1/O2 adjacent
- **Animation sequence:**
  1. O1 passes to O5 at the elbow.
  2. O1 and O2 move toward each other above/around O5.
  3. One player screens the other or they exchange paths.
  4. O5 reads the cutter to the rim or shooter to the arc.
  5. If no pass, O5 enters DHO with the remaining guard.
- **Primary goal:** Use the elbow as a passing hub and force perimeter defenders to navigate a split.

### Elbow Backdoor

- **Type:** Set action
- **Starting alignment:** O5 elbow, O2 denied
- **Animation sequence:**
  1. O1 enters O5 at the elbow.
  2. O2 steps toward the wing as if receiving from O5.
  3. X2 denies high.
  4. O2 cuts behind X2 to the rim.
  5. O5 delivers bounce/lob pass.
  6. Other players lift to clear the lane.
- **Primary goal:** Punish denial while the big has a clear passing angle from the elbow.

### Top Isolation

- **Type:** Isolation set
- **Starting alignment:** O1 top; four teammates flattened/wide
- **Animation sequence:**
  1. O2/O3 move to deep corners.
  2. O4/O5 flatten to corners/dunker or opposite baseline spots.
  3. O1 holds the ball centrally.
  4. O1 attacks X1 left or right without a screen.
  5. Spacers move only if their defenders commit to help.
- **Primary goal:** Give the creator maximum two-way driving space and minimize immediate help.

### Empty-Side Isolation

- **Type:** Isolation set
- **Starting alignment:** O1 wing; all teammates opposite
- **Animation sequence:**
  1. O1 dribbles to the desired wing.
  2. All four teammates clear to the opposite half of the floor.
  3. O1 pauses until the side is empty.
  4. O1 attacks baseline or middle against X1.
  5. Weak-side players remain ready for skip passes if helpers leave.
- **Primary goal:** Create a pure 1-on-1 with the longest possible help rotation.

### Switch Hunt Isolation

- **Type:** Isolation sequence
- **Starting alignment:** Screen used to force desired matchup
- **Animation sequence:**
  1. O1 identifies target defender X5/X4.
  2. O5 or O4 sets a screen specifically to force a switch.
  3. O1 uses the screen only enough to create the matchup.
  4. Once switch is confirmed, screener clears away.
  5. Other players flatten or clear.
  6. O1 attacks the new defender in isolation.
- **Primary goal:** Use screening as a matchup-selection tool rather than primarily as an advantage action.

---

# 8. Post and interior plays

### Punch / Direct Post Entry

- **Type:** Post play
- **Starting alignment:** O5 low or mid-post; ball on wing/top
- **Animation sequence:**
  1. O5 establishes a seal on the desired block.
  2. Ball handler improves the passing angle with one or two dribbles or a wing entry.
  3. Pass goes directly into O5.
  4. Nearest perimeter players relocate to create clear passing windows.
  5. O5 faces up or backs down.
  6. If doubled, O5 kicks to the open perimeter player.
- **Primary goal:** Establish an interior touch for a designated scorer.

### Cross-Screen Post-Up

- **Type:** Post play
- **Starting alignment:** O4/O5 opposite sides of lane
- **Animation sequence:**
  1. O4 moves across the lane to screen X5.
  2. O5 cuts from weak-side block to strong-side block.
  3. O5 seals X5 on the inside shoulder.
  4. Perimeter player delivers immediate post entry.
  5. O4 exits to short corner or receives a screen-the-screener action.
- **Primary goal:** Move the post defender and create deeper catching position.

### Wedge Post-Up

- **Type:** Post play
- **Starting alignment:** O5 begins high/weak side; O4 sets wedge
- **Animation sequence:**
  1. O4 positions between X5 and the desired block.
  2. O5 cuts behind O4's wedge screen toward the block.
  3. O5 seals as soon as X5 is displaced.
  4. Ball is entered from wing/top.
  5. O4 clears to opposite side.
- **Primary goal:** Create a deep seal by screening the post defender before the entry.

### High-Low Entry

- **Type:** Post play
- **Starting alignment:** O4 high post, O5 low post
- **Animation sequence:**
  1. O1 passes to O4 at high post.
  2. O5 seals X5 on the low block/rim line.
  3. O4 turns to face the basket.
  4. If X5 fronts, O4 throws over the top.
  5. If backside help arrives, weak-side corner lifts for kick-out.
  6. If no pass, O4 can face up or DHO.
- **Primary goal:** Use a high-post passer to feed a low-post target over fronting/denial defense.

### Post DHO

- **Type:** Post action
- **Starting alignment:** O5 catches block/elbow; O2 cuts around
- **Animation sequence:**
  1. O5 receives the post/elbow entry.
  2. O2 begins a cut toward O5.
  3. O5 pivots to protect the ball and offers handoff.
  4. O2 takes the handoff tightly off O5's body.
  5. O5 screens X2 and then rolls/seals.
  6. O2 attacks the lane.
- **Primary goal:** Turn a post touch into a moving perimeter attack.

### Post → Hammer

- **Type:** Compound post play
- **Starting alignment:** Post/baseline attack with weak-side corner
- **Animation sequence:**
  1. Enter O5 in the post or allow O1 to drive baseline from post-side.
  2. Ball handler attacks toward baseline.
  3. Weak-side screener O4 moves behind X3.
  4. O3 cuts to the weak-side corner off O4's Hammer screen.
  5. Ball is skipped across the baseline.
  6. O5/driver occupies interior help.
- **Primary goal:** Punish post/baseline help with an opposite-corner three.

---

# 9. Transition and early offense

### Primary Fast Break

- **Type:** Transition scheme
- **Starting alignment:** Rebound/turnover, open floor
- **Animation sequence:**
  1. Rebounder secures the ball.
  2. Nearest guard opens to receive outlet.
  3. Two wings sprint wide in outside lanes.
  4. Big/rim runner sprints the middle lane to the rim.
  5. Ball handler pushes up the middle or advances by pass.
  6. Read rim runner, wide wing, or direct drive before defense sets.
- **Primary goal:** Create a shot before the defense matches up.

### Hit-Ahead Break

- **Type:** Transition action
- **Starting alignment:** Guard with outlet, wing ahead
- **Animation sequence:**
  1. Outlet reaches O1.
  2. O2/O3 sprint beyond their defenders.
  3. O1 throws the ball ahead instead of dribbling the entire distance.
  4. Receiver attacks the rim or draws the last defender.
  5. Trailer fills behind for a secondary pass.
- **Primary goal:** Move the ball faster than defenders can run back.

### Rim Run

- **Type:** Transition action
- **Starting alignment:** Big behind play after change of possession
- **Animation sequence:**
  1. O5 immediately sprints directly down the center lane.
  2. O5 beats X5 to the restricted area.
  3. O5 seals under the rim.
  4. Ball handler looks for early lob or post feed.
  5. If not open, O5 exits to dunker or sets drag screen.
- **Primary goal:** Force the defense to protect the rim and create early interior position.

### Drag Screen

- **Type:** Early-offense action
- **Starting alignment:** O1 advancing; O5 trailing
- **Animation sequence:**
  1. O1 pushes up the middle.
  2. O5 sprints into a high ball-screen angle before X5 is set.
  3. O1 uses the screen immediately.
  4. O5 rolls hard.
  5. Wings occupy corners/lanes.
  6. Read pull-up, roll, or drive.
- **Primary goal:** Attack a backpedaling or cross-matched defense before it can call organized coverage.

### Double Drag Roll-Pop

- **Type:** Early-offense play
- **Starting alignment:** O4/O5 trail O1
- **Animation sequence:**
  1. O4 sets the first drag screen.
  2. O5 sets the second drag screen.
  3. O1 uses both.
  4. O4 pops to the arc after screening.
  5. O5 rolls to the rim.
  6. O1 reads the defender covering the two bigs and chooses pop, roll, or own attack.
- **Primary goal:** Create simultaneous vertical and perimeter threats in transition.

### Early Pistol

- **Type:** Early-offense play
- **Starting alignment:** Wing handler, corner guard, trailing big
- **Animation sequence:**
  1. O1 advances to the side.
  2. O2 rises from corner for pitch/handoff.
  3. O5 trails directly into ball-screen position.
  4. O2 receives the exchange and uses O5's screen.
  5. O1 clears or flares.
  6. Weak side stays spaced.
- **Primary goal:** Start structured offense while defenders are still cross-matched.

### Flow Into Delay

- **Type:** Transition-to-half-court flow
- **Starting alignment:** Transition ends without shot
- **Animation sequence:**
  1. O1 advances the ball while O5 trails.
  2. If no fast-break shot appears, O1 passes back to O5 at the top.
  3. Wings fill corners/slots.
  4. O1 cuts through or executes Get action.
  5. Offense is now in Delay without stopping.
- **Primary goal:** Avoid a dead reset and preserve transition momentum into 5-out offense.

---

# 10. Zone-offense plays

### Zone Overload

- **Type:** Zone offense
- **Starting alignment:** Ball on wing; three attackers same side
- **Animation sequence:**
  1. O1/O2 move the ball to a wing.
  2. One player fills the corner.
  3. One player flashes to high post or short corner.
  4. One player stays at wing/top on the same side.
  5. The zone must assign two defenders to three threats.
  6. Pass to whichever area is uncovered.
- **Primary goal:** Create a local 3-on-2 against the zone.

### High-Post Flash

- **Type:** Zone offense
- **Starting alignment:** Perimeter spacing vs 2-3/1-2-2
- **Animation sequence:**
  1. Ball is passed from top to wing.
  2. O4/O5 times a cut from weak side or baseline into the nail/high post.
  3. Wing passer feeds the high-post flash.
  4. High-post receiver turns to face.
  5. Read short corner, opposite wing, rim drive, or high-low pass.
- **Primary goal:** Put the ball in the center of the zone where one player can see every gap.

### Short-Corner Flash

- **Type:** Zone offense
- **Starting alignment:** Perimeter shell plus baseline player
- **Animation sequence:**
  1. Ball moves to one wing.
  2. Baseline player O5 slides behind the low zone defender into short corner.
  3. Wing feeds O5.
  4. O5 faces up and draws the center/baseline defender.
  5. Read layup, dump-off, high-post pass, or corner kick-out.
- **Primary goal:** Attack the space behind the bottom line of the zone and pull the rim protector away from the rim.

### Baseline Runner

- **Type:** Zone offense
- **Starting alignment:** One designated baseline player
- **Animation sequence:**
  1. O5 starts in one short corner.
  2. As the ball reverses, O5 runs behind the zone along the baseline.
  3. O5 arrives in the opposite short corner before the low defender fully shifts.
  4. Ball is skipped/reversed to O5 or the adjacent corner.
  5. Continue running baseline with each reversal.
- **Primary goal:** Force low zone defenders to repeatedly exchange responsibility and lose vision.

### Overload → Skip

- **Type:** Zone offense
- **Starting alignment:** Overload one side
- **Animation sequence:**
  1. Place three attackers on the right side.
  2. Move the ball right until the zone compresses.
  3. Opposite shooter O3 stays wide and ready.
  4. Ball handler throws a skip pass to O3.
  5. O3 shoots or attacks the long closeout.
  6. High-post player seals the nearest rotating defender.
- **Primary goal:** Pull the zone toward one side, then attack the weak side before it can recover.

### Ball Screen vs Zone

- **Type:** Zone offense
- **Starting alignment:** Guard near top/wing, screener targets top zone defender
- **Animation sequence:**
  1. O5 screens the top/wing zone defender rather than a specific matchup.
  2. O1 dribbles through the screened seam.
  3. O5 rolls into the middle gap.
  4. Adjacent zone defender must step up.
  5. O1 passes to corner, roll, or high-post player based on rotation.
- **Primary goal:** Force a zone defender to make man-to-man screening decisions and open a seam.

### Pin-In vs Zone

- **Type:** Zone offense
- **Starting alignment:** Shooter in corner, screener inside low defender
- **Animation sequence:**
  1. Ball reverses toward the shooter side.
  2. O5/O4 moves inside the low zone defender.
  3. Screener pins that defender toward the paint.
  4. Corner shooter stays or drifts outward.
  5. Ball is skipped to the corner before the top defender rotates.
- **Primary goal:** Prevent the low zone defender from closing out to the corner.

### High-Low vs Zone

- **Type:** Zone offense
- **Starting alignment:** High post plus baseline/low post
- **Animation sequence:**
  1. Enter the ball to O4 at the high post.
  2. O5 slides behind the middle defender toward the rim/short corner.
  3. O4 turns and immediately looks low.
  4. If middle defender steps to O4, pass to O5.
  5. If baseline defender pinches O5, kick to corner.
- **Primary goal:** Create a vertical two-on-one inside the zone.

### Skip-and-Drive

- **Type:** Zone offense
- **Starting alignment:** Ball one side, shooter opposite
- **Animation sequence:**
  1. Reverse/skip the ball from one wing to the opposite wing.
  2. Receiving player catches while the zone is still shifting.
  3. Instead of holding, receiver attacks the closeout immediately.
  4. High-post and short-corner players relocate to passing windows.
  5. Drive ends in finish, dump-off, or kick-out.
- **Primary goal:** Turn a slow zone rotation into a downhill driving opportunity.

---

# 11. Baseline out-of-bounds (BLOB) plays

### Box BLOB – Cross Screen Post

- **Type:** BLOB
- **Starting alignment:** Box formation
- **Animation sequence:**
  1. O4 cross-screens for O5 across the lane.
  2. O5 cuts to the ball-side block and seals.
  3. O2 clears upward to occupy help.
  4. Inbounder O1 looks first to O5.
  5. If covered, O4 receives a screen-the-screener action and exits to the perimeter.
- **Primary goal:** Create a quick deep post catch while preserving a second option.

### Box BLOB – Screen the Screener

- **Type:** BLOB
- **Starting alignment:** Box formation
- **Animation sequence:**
  1. O4 screens O2 toward the corner/rim.
  2. As X4 helps or turns, O5 screens X4.
  3. O4 cuts toward the rim or perimeter after the second screen.
  4. Inbounder reads O2 first, O4 second.
  5. Remaining player clears away.
- **Primary goal:** Exploit the first screener's defender after attention shifts to the first cutter.

### Box BLOB – Elevator

- **Type:** BLOB
- **Starting alignment:** Box
- **Animation sequence:**
  1. O2 begins low in the box.
  2. O4/O5 move into elevator positions above the lane.
  3. O2 cuts between them.
  4. O4/O5 close the gap behind O2.
  5. Inbounder passes to O2 for the three.
  6. O3 clears to the opposite side.
- **Primary goal:** Generate an immediate perimeter shot from a compact inbound alignment.

### Stack BLOB – Slip

- **Type:** BLOB
- **Starting alignment:** Vertical stack
- **Animation sequence:**
  1. Players break from the stack as if setting crossing screens.
  2. O4 steps toward X2/X3 as though screening.
  3. O4 slips immediately to rim.
  4. O2/O3 fan out to corners/wings.
  5. Inbounder looks to O4 first, then perimeter outlets.
- **Primary goal:** Use expected switching out of a stack to free a slip at the rim.

### BLOB Lob

- **Type:** BLOB
- **Starting alignment:** Box/stack/line
- **Animation sequence:**
  1. Primary target O5 starts away from rim.
  2. O4 sets a hard back screen on X5.
  3. O5 explodes toward the front of the rim.
  4. Inbounder throws lob above help.
  5. Perimeter players clear defenders away from the lane.
- **Primary goal:** Create a direct catch above the rim before help can rotate.

### BLOB Hammer

- **Type:** BLOB
- **Starting alignment:** Baseline inbound with weak-side shooter
- **Animation sequence:**
  1. Inbounder enters to a guard near the corner/wing.
  2. Guard attacks baseline.
  3. Weak-side O4 sets Hammer screen for O3.
  4. O3 relocates to opposite corner.
  5. Ball handler skips the pass across baseline.
  6. Inbounder can step in as safety outlet.
- **Primary goal:** Use the inbound situation to quickly manufacture a weak-side corner three.

# 12. Sideline out-of-bounds (SLOB) plays

### SLOB → Pick-and-Roll

- **Type:** SLOB
- **Starting alignment:** Sideline inbound, handler targeted
- **Animation sequence:**
  1. O1 inbounds to O2 near top/wing.
  2. O1 immediately enters the court and clears.
  3. O5 steps into a ball-screen position.
  4. O2 uses O5's screen.
  5. O5 rolls.
  6. Other players flatten to corners/weak side.
- **Primary goal:** Get the primary creator directly into a controlled ball screen after the inbound.

### SLOB Spain

- **Type:** SLOB
- **Starting alignment:** Sideline inbound with three-man screen group
- **Animation sequence:**
  1. Inbounder enters to O1.
  2. O5 immediately approaches for ball screen.
  3. O2 positions behind the action.
  4. O1 uses O5's screen and O5 rolls.
  5. O2 back-screens X5 and pops.
  6. Inbounder steps in as weak-side safety/spacing player.
- **Primary goal:** Run Spain before the defense has fully organized after the inbound.

### SLOB Zoom

- **Type:** SLOB
- **Starting alignment:** Shooter low, screener inside, handoff hub
- **Animation sequence:**
  1. Inbounder passes to O5 or top hub.
  2. O4 sets a pindown for O2.
  3. O2 rises off the screen.
  4. O5 dribbles into DHO with O2.
  5. O2 attacks downhill.
  6. Inbounder enters as corner/weak-side spacer.
- **Primary goal:** Use a sideline inbound to create immediate movement into Chicago/Zoom.

### SLOB Isolation

- **Type:** SLOB
- **Starting alignment:** Star receives near wing/top
- **Animation sequence:**
  1. Inbounder passes to O1.
  2. O2/O3/O4/O5 all clear to the opposite side/baseline.
  3. O1 waits for spacing to complete.
  4. O1 attacks the matchup one-on-one.
  5. Weak-side players are available only if help commits.
- **Primary goal:** Create a late-game or late-clock isolation with controlled spacing.

---

# 13. Defensive team schemes

### Man-to-Man

- **Type:** Defensive scheme
- **Starting alignment:** Each Xi matched to corresponding Oi
- **Animation sequence:**
  1. X1 picks up O1.
  2. X2-X5 position between their assignments and the basket while seeing ball and man.
  3. On passes, defenders jump toward the ball and establish new help positions.
  4. On cuts, defenders trail, deny, switch, or pass off according to team rules.
  5. On drives, nearest helper stunts or rotates while the original defender recovers.
- **Primary goal:** Maintain individual matchups while building connected help behind the ball.

### Gap Man

- **Type:** Defensive scheme
- **Starting alignment:** Man matchups with off-ball sag
- **Animation sequence:**
  1. On-ball defender pressures the ball.
  2. One-pass-away defenders position in the driving gaps rather than full denial.
  3. Two-pass-away defenders sink toward the lane.
  4. When a drive begins, gap defender steps into the lane.
  5. After the pass out, defenders recover to shooters.
- **Primary goal:** Protect the paint and force jump shots or kick-outs.

### Pack Line

- **Type:** Defensive scheme
- **Starting alignment:** Man-to-man with all off-ball defenders inside pack line
- **Animation sequence:**
  1. X1 pressures the ball.
  2. X2-X5 position inside an imaginary arc roughly inside the three-point line unless guarding the ball.
  3. On penetration, multiple defenders shrink toward the paint.
  4. When the ball is passed out, the closest defender closes out under control.
  5. Defense repeats shrink-and-recover.
- **Primary goal:** Eliminate straight-line drives and paint touches.

### Switch Everything

- **Type:** Defensive scheme
- **Starting alignment:** Man defense prepared to exchange on most screens
- **Animation sequence:**
  1. Defenders call the screen early.
  2. At screen contact, X1 takes the screener and X5 takes the handler.
  3. Off-ball defenders stay home unless a mismatch requires help.
  4. If offense seals a mismatch, defense may scram switch.
  5. Repeat on subsequent screens.
- **Primary goal:** Remove screening separation and keep the ball in front.

### 2-3 Zone

- **Type:** Defensive scheme
- **Starting alignment:** Two high defenders; three low defenders
- **Animation sequence:**
  1. X1/X2 guard top and wings above free-throw line.
  2. X3/X4 guard wings/corners and low blocks.
  3. X5 anchors the middle/rim.
  4. Ball movement causes the shell to shift as a unit.
  5. High-post catches trigger X5 or a wing defender to step up.
  6. Weak-side low defender protects the rim and rebound.
- **Primary goal:** Protect the paint with layered help while contesting perimeter via rotations.

### 3-2 Zone

- **Type:** Defensive scheme
- **Starting alignment:** Three high defenders; two low defenders
- **Animation sequence:**
  1. X1 centers at top.
  2. X2/X3 extend to wings.
  3. X4/X5 guard blocks/baseline.
  4. Ball reversal shifts the top line side-to-side.
  5. Corner passes force the nearest low defender to close out.
  6. Opposite low defender slides toward rim.
- **Primary goal:** Improve perimeter coverage while accepting more pressure on corners/interior.

### 1-3-1 Zone

- **Type:** Defensive scheme
- **Starting alignment:** One top, three across middle, one baseline runner
- **Animation sequence:**
  1. X1 pressures the top and influences a side.
  2. X2/X3 guard wings, X5 guards middle/high post.
  3. X4 runs the baseline from corner to corner.
  4. Wing catches can trigger traps with X1 + wing defender.
  5. Baseline runner protects corner and rim depending on ball location.
- **Primary goal:** Disrupt passing lanes, create traps, and make the offense play over length.

### Box-and-One

- **Type:** Defensive scheme
- **Starting alignment:** Four zone defenders + one chaser
- **Animation sequence:**
  1. X1 face-guards the designated star.
  2. X2-X5 form a box around lane/elbows/blocks.
  3. The box shifts with the ball like a compact zone.
  4. X1 follows the star through screens, using help from the box when needed.
  5. On a catch by the star, nearest box defender can stunt or double.
- **Primary goal:** Remove one elite scorer while keeping four defenders in strong help positions.

---

# 14. Ball-screen defensive coverages

### Drop Coverage

- **Type:** Ball-screen defense
- **Starting alignment:** X1 on handler; X5 on screener
- **Animation sequence:**
  1. X1 calls the screen and fights over it.
  2. X5 retreats toward the paint while keeping O1 and O5 in front.
  3. X1 trails O1 from behind/side.
  4. X5 contains the drive until X1 recovers.
  5. Weak-side low defender tags O5 if O5 rolls hard.
  6. X5 returns to O5 after the ball is contained.
- **Primary goal:** Protect the rim and roller while conceding some pull-up space.

### Deep Drop

- **Type:** Ball-screen defense
- **Starting alignment:** Same as drop with X5 near rim
- **Animation sequence:**
  1. X1 fights over the screen.
  2. X5 stays several feet below the screen, often near the paint/rim.
  3. X1 chases the handler into X5's area.
  4. X5 prioritizes preventing layup/lob.
  5. Perimeter helpers stay attached to shooters as much as possible.
- **Primary goal:** Maximize rim protection against non-elite pull-up shooters.

### At-Level

- **Type:** Ball-screen defense
- **Starting alignment:** X5 meets handler near screen level
- **Animation sequence:**
  1. X1 trails or goes over.
  2. X5 steps up to approximately the level of the screen.
  3. X5 contains O1 until X1 recovers.
  4. X5 then retreats with the roller.
  5. Low man tags if O5 gains inside position.
- **Primary goal:** Reduce pull-up shooting space while still attempting to recover to the roller.

### Switch

- **Type:** Ball-screen defense
- **Starting alignment:** X1/X5 prepared to exchange
- **Animation sequence:**
  1. X1 calls the screen.
  2. As O1 uses O5's screen, X5 steps onto O1.
  3. X1 drops onto O5.
  4. Both defenders square up to their new assignments.
  5. If O5 seals X1, weak-side defense may scram X1 out.
- **Primary goal:** Erase the immediate ball-screen advantage at the cost of possible mismatches.

### Hedge / Show

- **Type:** Ball-screen defense
- **Starting alignment:** X5 aggressively steps out
- **Animation sequence:**
  1. X1 forces O1 into the screen and begins to recover over it.
  2. X5 jumps laterally into O1's path above the level of the screen.
  3. O1 is forced to retreat, widen, or pass.
  4. X1 recovers to O1.
  5. X5 sprints back to O5.
  6. Weak-side low defender tags O5 during X5's recovery.
- **Primary goal:** Delay the ball handler long enough for the on-ball defender to recover.

### Blitz / Trap

- **Type:** Ball-screen defense
- **Starting alignment:** Two defenders attack handler
- **Animation sequence:**
  1. X1 forces O1 into O5's screen.
  2. X5 jumps high and stays with O1 rather than recovering immediately.
  3. X1 and X5 form a two-man trap around O1.
  4. Weak-side defenders zone up against the remaining four offensive players.
  5. If O1 passes out, defenders rotate to the first receiver.
  6. X5 recovers only after the ball leaves the trap.
- **Primary goal:** Force the ball out of an elite creator's hands and create rushed 4-on-3 decisions.

### Ice / Down

- **Type:** Ball-screen defense
- **Starting alignment:** Side P&R
- **Animation sequence:**
  1. X1 positions above O1 to block the route toward O5's screen.
  2. X1 angles O1 toward the baseline/sideline.
  3. X5 drops below the screen to contain baseline penetration.
  4. O5's screen becomes difficult or unusable.
  5. Low defenders stay ready for the roll/baseline drive.
- **Primary goal:** Keep a side ball screen from getting to the middle of the floor.

### Under

- **Type:** Ball-screen defense
- **Starting alignment:** Against weaker shooter
- **Animation sequence:**
  1. X1 anticipates O5's screen.
  2. Instead of following O1 over, X1 runs below O5 between screener and basket.
  3. X5 stays closer to O5/paint.
  4. X1 meets O1 on the other side of the screen.
  5. Defense lives with the pull-up if O1 shoots behind the screen.
- **Primary goal:** Protect the paint and avoid being put behind the play.

### Pre-Switch

- **Type:** Ball-screen defense
- **Starting alignment:** Off-ball defenders exchange before screen
- **Animation sequence:**
  1. Defense identifies the upcoming ball screen.
  2. Before O5 arrives, X5 switches assignments with a more suitable defender X4/X3.
  3. New defender meets O5 at the screen.
  4. Original X5 stays on the off-ball player.
  5. When the ball screen occurs, defense can switch or play coverage without creating the unwanted mismatch.
- **Primary goal:** Prevent the offense from forcing a specific defender into the ball-screen matchup.

### Switch-Back

- **Type:** Ball-screen defense
- **Starting alignment:** Temporary switch
- **Animation sequence:**
  1. X1/X5 switch at the screen.
  2. X5 contains O1 temporarily.
  3. As O1 moves away or passes, X1 and X5 communicate the return.
  4. X1 recovers back to O1.
  5. X5 returns to O5.
  6. Off-ball help prevents the offense from exploiting the brief mismatch.
- **Primary goal:** Gain the immediate benefit of switching without keeping the mismatch.

### Scram Switch

- **Type:** Defensive rotation
- **Starting alignment:** Small defender stuck on big
- **Animation sequence:**
  1. After a switch, X1 is guarding O5 near the paint.
  2. Before the post entry arrives, nearby bigger defender X3/X4 rotates onto O5.
  3. X1 simultaneously exits to X3/X4's former assignment.
  4. The exchange occurs while the ball is still outside.
  5. Defense re-establishes matchups without conceding the post mismatch.
- **Primary goal:** Remove a small defender from a dangerous interior mismatch.

### Peel Switch

- **Type:** Defensive rotation
- **Starting alignment:** On-ball defender beaten on drive
- **Animation sequence:**
  1. O1 beats X1 off the dribble.
  2. Help defender X2/X5 steps up to stop O1.
  3. Instead of chasing O1 from behind, X1 peels away.
  4. X1 takes the offensive player abandoned by the helper.
  5. The helper stays on O1.
  6. Remaining defenders adjust one position if necessary.
- **Primary goal:** Repair a drive without forcing the helper to recover all the way back.

### Triple Switch vs Spain

- **Type:** Ball-screen defense
- **Starting alignment:** Three defenders involved in Spain
- **Animation sequence:**
  1. X1/X5 initially switch or contain the ball screen.
  2. As O2 back-screens X5, X2 calls the Spain action.
  3. X2 takes the rolling O5.
  4. X5 releases from the back screen and takes popping O2.
  5. X1 remains with O1.
  6. Defense finishes with three new assignments but no uncovered player.
- **Primary goal:** Defend Spain without allowing either the roller or popping back-screener to become free.

---

# 15. Full-court and trapping schemes

### 1-2-1-1 Diamond Press

- **Type:** Press defense
- **Starting alignment:** One on inbound, two wings, one interceptor, one safety
- **Animation sequence:**
  1. X1 pressures the inbounder/first receiver.
  2. X2/X3 align near free-throw-line extended or sideline lanes.
  3. X4 positions as middle interceptor.
  4. X5 protects the back court/rim.
  5. On the first sideline catch, X1 and nearest wing sprint into a trap.
  6. X4 reads the next pass and looks to intercept.
  7. X5 stays behind the play as safety.
- **Primary goal:** Force the ball toward a sideline trap and create predictable passes.

### 2-2-1 Press

- **Type:** Press defense
- **Starting alignment:** Two front, two middle, one deep
- **Animation sequence:**
  1. X1/X2 pressure the first line and influence the ball to a sideline.
  2. X3/X4 protect middle and sideline passing lanes.
  3. X5 stays deepest.
  4. When the ball enters a designated sideline area, front and middle defender trap.
  5. Opposite defenders rotate to middle and next pass.
- **Primary goal:** Slow the advance, create sideline traps, and burn clock.

### Run-and-Jump

- **Type:** Press/man pressure
- **Starting alignment:** Full-court man with surprise switches
- **Animation sequence:**
  1. X1 pressures O1 up the floor.
  2. When O1 dribbles toward a teammate/side, nearby defender X2 suddenly leaves O2 and jumps O1.
  3. X1 immediately leaves the ball and rotates to O2.
  4. Other defenders rotate behind if necessary.
  5. Repeat unpredictably without requiring a stationary trap.
- **Primary goal:** Surprise the ball handler with aggressive switching and create turnovers without a set zone press.

### Half-Court Trap

- **Type:** Trapping scheme
- **Starting alignment:** Man/zone shell near sideline
- **Animation sequence:**
  1. Defense allows the ball to cross half court.
  2. Ball defender steers O1 toward a sideline/corner trigger area.
  3. Nearest helper sprints into a hard double team.
  4. Backside defenders zone up against three offensive players.
  5. On pass out, defense rotates to the first receiver and either keeps trapping or recovers.
- **Primary goal:** Use the sideline as an extra defender and force long escape passes.

---

# 16. Compound-play quick reference

Use these as reusable **animation macros**. The app can construct a longer play by concatenating these primitives.

| Compound action | Animation macro |
|---|---|
| **Chicago / Zoom** | Pindown → DHO |
| **Miami** | DHO → Ball Screen |
| **Spain** | Ball Screen → Roller → Back Screen on Roller Defender → Pop |
| **Ram P&R** | Off-Ball Screen for Screener → Ball Screen → Roll/Pop |
| **Ram Ghost** | Off-Ball Screen for Screener → Ghost → Drive/Pop |
| **Zipper P&R** | Zipper Cut → Catch → Ball Screen |
| **Iverson P&R** | Iverson Cut → Catch → Ball Screen |
| **UCLA P&R** | Pass → UCLA Back Screen Cut → Clear → Ball Screen |
| **Flex Screen-the-Screener** | Flex Cut → Original Screener receives Down Screen |
| **Horns Twist** | Horns → Ball Screen → Flip/Re-Screen Opposite |
| **Horns Spain** | Horns → Ball Screen → Spain Back Screen |
| **Horns Zoom** | Horns Entry → Pindown → DHO |
| **Double Drag Roll-Pop** | Drag 1 → Pop + Drag 2 → Roll |
| **P&R Hammer** | Ball Screen → Baseline Drive → Weak-Side Hammer |
| **P&R Shake** | Ball Screen → Roller Tag → Weak-Side Lift/Shake |
| **P&R 45** | Ball Screen → Roller Tag → 45 Cut |
| **Zoom P&R** | Pindown → DHO → Ball Screen |
| **Zoom Spain** | Pindown → DHO → Spain P&R |
| **Delay Get** | Top Big Catch → Pass → Get Handoff |
| **Delay Chicago** | Top Big Catch → Pindown → DHO |
| **Delay Backdoor** | Top Big Catch → Denial Read → Backdoor |
| **Post Split** | Post Entry → Split Screen/Cut |
| **Post Split DHO** | Post Entry → Split → DHO |
| **Post Hammer** | Post/Baseline Attack → Hammer |
| **Pistol P&R** | Guard Exchange → Trailing Ball Screen |
| **Pistol Flare** | Guard Exchange → Flare Screen |
| **Pistol Delay** | Early Side Action → Reversal to Trailer → Delay |
| **Floppy P&R** | Floppy Exit → Catch → Ball Screen |
| **Floppy DHO** | Floppy Exit → DHO |
| **Stagger Curl** | Stagger → Curl Read |
| **Stagger Fade** | Stagger → Fade Read |
| **Stagger Backdoor** | Stagger Setup → Top-Lock Read → Backdoor |

---

# 17. Recommended data model for the app

Each animated play should be stored as a sequence of **events**, not only as a text description.

```json
{
  "id": "horns_spain",
  "name": "Horns Spain",
  "type": "set_play",
  "starting_formation": "horns",
  "mirrorable": true,
  "players": {
    "O1": "ball_handler",
    "O2": "corner_spacer",
    "O3": "corner_spacer",
    "O4": "back_screener",
    "O5": "ball_screener"
  },
  "events": [
    {
      "phase": 1,
      "actor": "O5",
      "action": "move",
      "from": "right_elbow",
      "to": "top_right_screen_point"
    },
    {
      "phase": 2,
      "actor": "O5",
      "action": "ball_screen",
      "target_defender": "X1"
    },
    {
      "phase": 3,
      "actor": "O1",
      "action": "dribble_use_screen",
      "direction": "right"
    },
    {
      "phase": 3,
      "actor": "O5",
      "action": "roll",
      "to": "rim"
    },
    {
      "phase": 4,
      "actor": "O4",
      "action": "back_screen",
      "target_defender": "X5"
    },
    {
      "phase": 5,
      "actor": "O4",
      "action": "pop",
      "to": "left_slot"
    }
  ],
  "reads": [
    "handler_finish",
    "roller_lob",
    "back_screener_pop",
    "weak_side_kickout"
  ],
  "primary_goal": "Overload the screener defender with simultaneous rim and perimeter threats."
}
```

## Recommended event types

- `move`
- `cut`
- `dribble`
- `pass`
- `handoff`
- `ball_screen`
- `off_ball_screen`
- `roll`
- `pop`
- `slip`
- `ghost`
- `seal`
- `post_up`
- `relocate`
- `lift`
- `drift`
- `flare`
- `switch`
- `help`
- `tag`
- `trap`
- `recover`
- `shot`
- `reset`

## Recommended branch model

A play should not be one unbreakable animation. Store its base sequence, then add branches such as:

```text
BASE: Pick-and-Roll
├─ Defense goes under → pull-up / re-screen
├─ Defense drops → pull-up / pocket pass / snake
├─ Defense switches → mismatch ISO / seal
├─ Defense blitzes → short roll
└─ Low man tags → 45 cut / shake / skip
```

This allows the visualizer to teach **why** the play exists rather than only showing memorized movement.

---

# 18. Implementation guidance for animation

1. **Animate by phases.** Treat each numbered step as a phase or sub-phase.
2. **Separate path and timing.** A player's path is geometry; the phase tells the app when that path begins.
3. **Use screen contact points.** Do not animate a screen as two players merely crossing. The screener should arrive, set, then the user of the screen should pass shoulder-to-hip.
4. **Preserve spacing constraints.** When one player cuts, another player should often replace or clear.
5. **Mirror every side-based action.** Store one canonical version and reflect X coordinates for left/right versions.
6. **Keep named plays compositional.** Build Spain from `ball_screen + roll + back_screen + pop`, not as one hard-coded animation.
7. **Attach goals to actions.** Every action should have a tactical goal such as `create_rim_pressure`, `force_switch`, `occupy_low_man`, or `free_shooter`.
8. **Attach defensive triggers.** Reads become much clearer when the user can toggle `drop`, `switch`, `blitz`, `under`, `top_lock`, `deny`, etc.
9. **Show the ball separately from player paths.** The ball should have its own event stream.
10. **Allow pauses at decision points.** Spain, P&R, Post Split, Zoom, and Princeton actions all become more educational when the animation pauses before the read.

# 19. Suggested next expansion

The next layer to add would be a dedicated **read/counter library** for each action: e.g. every response to drop, switch, hedge, blitz, top-lock, deny, and zone help. That would convert this from a play visualizer into a true interactive basketball decision engine.
