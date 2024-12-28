'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

interface User {
  id: number
  name: string
  email: string
  timeSpent: number
  isCheckedIn?: boolean
  checkInTime?: number
}

const getRankStyle = (index: number): string => {
  switch(index) {
    case 0: return "bg-yellow-100";
    case 1: return "bg-gray-100";
    case 2: return "bg-orange-100";
    default: return "";
  }
};

const getRankDisplay = (index: number): string => {
  switch(index) {
    case 0: return "1st";
    case 1: return "2nd";
    case 2: return "3rd";
    default: return `${index + 1}th`;
  }
};

export default function Home() {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .order('timeSpent', { ascending: false })
      
      if (fetchError) {
        console.error('Error fetching users:', fetchError)
        setError('Failed to fetch users')
        return
      }
      
      if (data) {
        setUsers(data)
        // Update logged in user if exists
        if (loggedInUser) {
          const updatedUser = data.find(u => u.id === loggedInUser.id)
          if (updatedUser) {
            setLoggedInUser(updatedUser)
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [loggedInUser])

  useEffect(() => {
    // Initial fetch
    fetchUsers()

    // Set up real-time subscription
    const channel = supabase.channel('users_db_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: 'isCheckedIn=eq.true'
        },
        (payload) => {
          console.log('Change received:', payload)
          if (payload.eventType === 'UPDATE') {
            setUsers(prevUsers => {
              const updatedUsers = [...prevUsers]
              const index = updatedUsers.findIndex(u => u.id === payload.new.id)
              if (index !== -1) {
                updatedUsers[index] = payload.new as User
              } else {
                updatedUsers.push(payload.new as User)
              }
              return updatedUsers.sort((a, b) => b.timeSpent - a.timeSpent)
            })
          } else if (payload.eventType === 'INSERT') {
            setUsers(prevUsers => {
              return [...prevUsers, payload.new as User]
                .sort((a, b) => b.timeSpent - a.timeSpent)
            })
          } else if (payload.eventType === 'DELETE') {
            setUsers(prevUsers => 
              prevUsers.filter(user => user.id !== payload.old.id)
                .sort((a, b) => b.timeSpent - a.timeSpent)
            )
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to real-time changes')
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [fetchUsers])

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const updateTime = async () => {
      if (!loggedInUser?.isCheckedIn || !loggedInUser?.checkInTime) return
      
      const now = Date.now()
      const timeElapsed = Math.floor((now - loggedInUser.checkInTime) / 60000)
      const newTimeSpent = loggedInUser.timeSpent + timeElapsed

      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            timeSpent: newTimeSpent,
            checkInTime: now
          })
          .eq('id', loggedInUser.id)

        if (updateError) {
          console.error('Error updating time:', updateError)
          setError('Failed to update time')
          return
        }

        setLoggedInUser(prev => prev ? {
          ...prev,
          timeSpent: newTimeSpent,
          checkInTime: now
        } : null)
      } catch (error) {
        console.error('Error:', error)
        setError('An unexpected error occurred')
      }
    }

    if (loggedInUser?.isCheckedIn) {
      updateTime()
      intervalId = setInterval(updateTime, 60000)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [loggedInUser])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const name = email.split('@')[0]

    try {
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select()
        .eq('email', email)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching user:', fetchError)
        setError('Failed to login')
        return
      }

      if (existingUser) {
        setLoggedInUser(existingUser)
      } else {
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([
            { name, email, timeSpent: 0 }
          ])
          .select()
          .single()

        if (insertError) {
          console.error('Error creating user:', insertError)
          setError('Failed to create account')
          return
        }

        if (newUser) {
          setLoggedInUser(newUser)
        }
      }
      setEmail('')
    } catch (error) {
      console.error('Error:', error)
      setError('An unexpected error occurred')
    }
  }

  const handleCheckIn = async () => {
    if (!loggedInUser) return
    setError(null)

    try {
      const now = Date.now()
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: true, 
          checkInTime: now 
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error checking in:', updateError)
        setError('Failed to check in')
        return
      }

      if (data) {
        setLoggedInUser({ ...data, checkInTime: now })
      }
    } catch (error) {
      console.error('Error:', error)
      setError('An unexpected error occurred')
    }
  }

  const handleCheckOut = async () => {
    if (!loggedInUser?.checkInTime) return
    setError(null)

    try {
      const now = Date.now()
      const timeElapsed = Math.floor((now - loggedInUser.checkInTime) / 60000)
      
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: false,
          timeSpent: loggedInUser.timeSpent + timeElapsed,
          checkInTime: null
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error checking out:', updateError)
        setError('Failed to check out')
        return
      }

      if (data) {
        setLoggedInUser(data)
      }
    } catch (error) {
      console.error('Error:', error)
      setError('An unexpected error occurred')
    }
  }

  const getUserRank = (userId: number) => {
    return users.findIndex(user => user.id === userId) + 1
  }

  if (isLoading) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="text-white text-center">Loading...</div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-white">Moffit Library Leaderboard</h1>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
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
                      ${index < 3 ? getRankStyle(index) : ''}`}
                  >
                    <td className="px-6 py-4 text-black">
                      {getRankDisplay(index)}
                    </td>
                    <td className="px-6 py-4 text-black">{user.name}</td>
                    <td className="px-6 py-4 text-black">{user.timeSpent}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}