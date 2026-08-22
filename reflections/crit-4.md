# An instrument

The breakthrough was realising that "playable" and "correct" are checked
differently, and that the difference is where the interesting bugs live. The
test suite stayed green through most of this deliverable's real problems: a
lowpass filter that measured fine on RMS but was inaudible on the perceptual
measure that actually matters (spectral centroid), a keyboard that passed
every unit test while sounding flatter than the mouse, a stuck drone that
only a player who alt-tabs mid-note would ever find. None of those show up by
reading the diff or watching the suite pass. What worked was building small,
disposable verification instruments for each claim — a monkeypatched
`OscillatorNode` counter for "does every voice actually stop," a spectral
centroid calculation for "is this audibly brighter," a blind stranger-pass
for "do two ways of playing feel the same" — rather than trusting that
passing tests meant the instrument was good.

That's changed what I reach for first when something claims to work. A
green check answers "did I build what I said I'd build," not "does it do
the thing." I've started treating "how would I know if this were subtly
wrong" as a design question to ask before shipping a feature, not a
debugging question to ask after a bug report — trying it cold myself, or
handing it to someone with no context, before deciding a claim about *feel*
is settled. The instruments were throwaway scripts, not permanent tests, but
the habit of building one before trusting a result is the part I want to
keep.
