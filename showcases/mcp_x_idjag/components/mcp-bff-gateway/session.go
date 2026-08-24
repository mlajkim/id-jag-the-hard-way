package main

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// session holds the id_token acquired on the human user's behalf. The Client
// never sees this - it only ever holds the opaque map key (see sessionStore.create).
type session struct {
	idToken string
	exp     int64
}

// sessionStore is an in-memory map, matching the tradeoff every other
// in-process store in this showcase accepts (e.g. Pattern 2b's dpop-verifier
// pin store): a pod restart invalidates every active session and forces
// re-login, which is cheap and safe to redo.
type sessionStore struct {
	mu    sync.Mutex
	items map[string]session
}

func newSessionStore() *sessionStore {
	return &sessionStore{items: make(map[string]session)}
}

func (s *sessionStore) create(idToken string, exp int64) string {
	id := randomID()
	s.mu.Lock()
	s.items[id] = session{idToken: idToken, exp: exp}
	s.mu.Unlock()
	return id
}

func (s *sessionStore) get(id string) (session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.items[id]
	if !ok {
		return session{}, false
	}
	if sess.exp <= time.Now().Unix() {
		delete(s.items, id)
		return session{}, false
	}
	return sess, true
}

func randomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
