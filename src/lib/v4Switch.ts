// The pause switch for v4 early access. v4 is on in every build unless that build sets VITE_SIFT_V4=off (the deploy workflow passes the
// repository variable SIFT_V4). Paused, #/v4 shows a one-screen notice with the way to SIFT 2.0 and forgets a kept v4 choice; SIFT 2.0 and
// the classic interface, their routes and their saved data are not touched either way. See docs/v4/ROLLBACK.md.
export const V4_ENABLED = import.meta.env.VITE_SIFT_V4 !== 'off';
