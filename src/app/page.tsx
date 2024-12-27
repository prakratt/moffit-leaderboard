// app/page.tsx
'use client'
import { useState, useEffect } from 'react'

interface User {
  id: number
  name: string
  timeSpent: number
  isCheckedIn?: boolean
  checkInTime?: number
}

const MEDAL_STYLES = {
  1: "bg-yellow-100 border-yellow-400",
  2: "bg-gray-100 border-gray-400",
  3: "bg-orange-100 border-orange-400"
};

const MEDAL_ICONS = {
  1: "🏆",
  2: "🥈",
  3: "🥉"
};

export default function Home() {
  const [users, setUsers] = useState<User[]>([
    { id: 1, name: "John Doe", timeSpent: 4 },
    { id: 2, name: "Jane Smith", timeSpent: 2 },
    { id: 3, name: "Alice Johnson", timeSpent: 6 },
  ])

  const [email, setEmail] = useState('')
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null)

  // Update time spent for checked-in user
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (loggedInUser?.isCheckedIn) {
      intervalId = setInterval(() => {
        const now = Date.now();
        const timeElapsed = Math.floor((now - (loggedInUser.checkInTime || 0)) / 60000); // Convert to minutes

        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.id === loggedInUser.id
              ? { ...user, timeSpent: loggedInUser.timeSpent + timeElapsed }
              : user
          )
        );

        setLoggedInUser(prev => 
          prev ? { ...prev, timeSpent: prev.timeSpent + timeElapsed } : null
        );
      }, 60000); // Update every minute
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [loggedInUser?.isCheckedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const name = email.split('@')[0]
    const newUser = { id: users.length + 1, name, timeSpent: 0 }
    setLoggedInUser(newUser)
    setUsers([...users, newUser])
    setEmail('')
  }

  const handleCheckIn = () => {
    if (loggedInUser) {
      const now = Date.now();
      setUsers(users.map(user => 
        user.id === loggedInUser.id 
          ? { ...user, isCheckedIn: true, checkInTime: now }
          : user
      ))
      setLoggedInUser({ ...loggedInUser, isCheckedIn: true, checkInTime: now })
    }
  }

  const handleCheckOut = () => {
    if (loggedInUser && loggedInUser.checkInTime) {
      const now = Date.now();
      const timeElapsed = Math.floor((now - loggedInUser.checkInTime) / 60000); // Convert to minutes
      
      setUsers(users.map(user => 
        user.id === loggedInUser.id 
          ? { 
              ...user, 
              isCheckedIn: false, 
              timeSpent: user.timeSpent + timeElapsed,
              checkInTime: undefined 
            }
          : user
      ))
      setLoggedInUser({ 
        ...loggedInUser, 
        isCheckedIn: false, 
        timeSpent: loggedInUser.timeSpent + timeElapsed,
        checkInTime: undefined 
      })
    }
  }

  // Get user's rank
  const getUserRank = (userId: number) => {
    const sortedUsers = [...users].sort((a, b) => b.timeSpent - a.timeSpent);
    return sortedUsers.findIndex(user => user.id === userId) + 1;
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-white">Moffit Library Leaderboard</h1>
      
      {!loggedInUser ? (
        <div className="mb-8">
          <h2 className="text-xl mb-4 text-white">Login with Berkeley Email</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@berkeley.edu"
              pattern=".+@berkeley\.edu"
              required
              className="w-full max-w-md px-4 py-2 border rounded text-black"
            />
            <button 
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Login
            </button>
          </form>
        </div>
      ) : (
        <div className="mb-8 p-4 bg-white rounded shadow-lg">
          <p className="mb-4 text-black">Welcome, {loggedInUser.name}!</p>
          <p className="mb-4 text-black">
            Your current rank: {getUserRank(loggedInUser.id)}
            {getUserRank(loggedInUser.id) > 10 ? ` (${getUserRank(loggedInUser.id)} out of ${users.length})` : ''}
          </p>
          {loggedInUser.isCheckedIn ? (
            <button 
              onClick={handleCheckOut}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Check Out
            </button>
          ) : (
            <button 
              onClick={handleCheckIn}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Check In
            </button>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4 text-white">Current Rankings</h2>
        <div className="bg-white rounded-lg overflow-hidden shadow-lg">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-black">Rank</th>
                <th className="px-6 py-3 text-left text-black">Name</th>
                <th className="px-6 py-3 text-left text-black">Time (minutes)</th>
              </tr>
            </thead>
            <tbody>
              {users
                .sort((a, b) => b.timeSpent - a.timeSpent)
                .map((user, index) => (
                  <tr 
                    key={user.id}
                    className={`border-t ${loggedInUser?.id === user.id ? 'bg-blue-50' : ''}
                      ${index < 3 ? `${MEDAL_STYLES[index + 1]} border-l-4` : ''}`}
                  >
                    <td className="px-6 py-4 text-black">
                      {index < 3 ? MEDAL_ICONS[index + 1] : index + 1}
                    </td>
                    <td className="px-6 py-4 text-black">{user.name}</td>
                    <td className="px-6 py-4 text-black">{user.timeSpent}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}