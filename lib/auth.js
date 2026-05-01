import jwt from 'jsonwebtoken'

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
export const COOKIE_NAME = 'arena_token'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

export function getTokenFromRequest(request) {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function getUserFromRequest(request) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = verifyToken(token)
  return payload
}

export const TEMPLATES = [
  { id: 'java-oop', title: 'Java OOP Foundations', desc: 'Classes, inheritance, polymorphism', tags: ['java','oop'], icon: '☕', prompt: 'Generate 3 Java OOP problems covering classes, inheritance, polymorphism, encapsulation. Mix easy & medium.' },
  { id: 'java-exception', title: 'Java Exception Handling', desc: 'Try/catch, custom exceptions, throws', tags: ['java','exceptions'], icon: '⚠️', prompt: 'Generate 3 Java problems on exception handling with custom exception classes and try-catch-finally.' },
  { id: 'py-arrays', title: 'Python Arrays & Hashing', desc: 'Two-pointer, sliding window, hashmaps', tags: ['python','arrays'], icon: '🐍', prompt: 'Generate 3 medium Python problems on arrays and hashmaps (two-sum, sliding window, frequency).' },
  { id: 'py-strings', title: 'Python String Mastery', desc: 'Parsing, manipulation, regex-ish', tags: ['python','strings'], icon: '🔤', prompt: 'Generate 3 Python problems on string manipulation, parsing, and pattern matching. Easy to medium.' },
  { id: 'cpp-recursion', title: 'C++ Recursion & DP', desc: 'Recurrence, memoization, base cases', tags: ['cpp','recursion'], icon: '🔁', prompt: 'Generate 3 C++ problems on recursion and dynamic programming, ranging easy to medium.' },
  { id: 'js-async', title: 'JS: Arrays & Functional', desc: 'map/filter/reduce, closures', tags: ['javascript','functional'], icon: '📜', prompt: 'Generate 3 JavaScript problems testing array methods (map/filter/reduce) and closures, easy-medium.' },
  { id: 'java-collections', title: 'Java Collections', desc: 'List, Map, Set, sorting', tags: ['java','collections'], icon: '📦', prompt: 'Generate 3 Java problems using Collections (HashMap, ArrayList, TreeSet) covering sorting and grouping.' },
  { id: 'mixed-interview', title: '30-min Mock Interview', desc: 'Mixed easy + medium DSA', tags: ['dsa','interview'], icon: '🎯', prompt: 'Generate a 30-minute mock coding interview: 1 easy + 2 medium problems covering arrays, strings, and recursion. Language: python.' },
]
