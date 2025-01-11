'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { Clock, LogOut, Trophy } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Initialize Supabase client
const getSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

let supabase: ReturnType<typeof getSupabase>

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
    case 0: return "bg-yellow-50 dark:bg-yellow-900/20"
    case 1: return "bg-zinc-50 dark:bg-zinc-900/20"
    case 2: return "bg-orange-50 dark:bg-orange-900/20"
    default: return ""
  }
}

const getRankDisplay = (index: number): string => {
  switch(index) {
    case 0: return "1st"
    case 1: return "2nd"
    case 2: return "3rd"
    default: return `${index + 1}th`
  }
}

const getUserRank = (userId: number, usersList: User[]): number => {
  const sortedUsers = [...usersList].sort((a, b) => b.timeSpent - a.timeSpent)
  const index = sortedUsers.findIndex(user => user.id === userId)
  return index === -1 ? usersList.length : index + 1
}

export default function Home() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())

  // Initialize Supabase and check session on mount
  useEffect(() => {
    try {
      supabase = getSupabase()
      
      // Check for existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          handleUserSession(session.user)
        }
        setIsLoading(false)
      })

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          handleUserSession(session.user)
        } else {
          setLoggedInUser(null)
        }
      })

      return () => subscription.unsubscribe()
    } catch (error) {
      console.error('Failed to initialize Supabase:', error)
      setError('Failed to initialize application')
      setIsLoading(false)
    }
  }, [])

  const handleUserSession = async (authUser: any) => {
    const { data: existingUser } = await supabase
      .from('users')
      .select()
      .eq('email', authUser.email)
      .single()

    if (existingUser) {
      setLoggedInUser(existingUser)
    }
  }

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')

      if (error) {
        console.error('Error fetching users:', error)
        setError('Failed to fetch users')
      } else {
        setUsers(data || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setError('Failed to fetch users')
    }
  }, [supabase])

  useEffect(() => {
    const intervalId = setInterval(async () => {
      await fetchUsers()
    }, 5000) // Update every 5 seconds

    return () => clearInterval(intervalId)
  }, [fetchUsers])

  const handleCheckIn = async () => {
    if (!supabase || !loggedInUser) return
    setError(null)

    try {
      const now = Date.now()
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: true, 
          checkInTime: now,
          timeSpent: loggedInUser.timeSpent // Preserve existing time
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) throw updateError

      if (data) {
        setLoggedInUser(prev => ({ ...prev!, checkInTime: now, isCheckedIn: true }))
        setLastUpdateTime(now)
        await fetchUsers() // Refresh the leaderboard
      }
    } catch (error) {
      console.error('Error checking in:', error)
      setError('Failed to check in. Please try again.')
    }
  }

  const handleCheckOut = async () => {
    if (!supabase || !loggedInUser?.checkInTime) return
    setError(null)

    try {
      const now = Date.now()
      const timeElapsed = Math.floor((now - loggedInUser.checkInTime) / 60000) // Convert to minutes
      const newTotalTime = loggedInUser.timeSpent + timeElapsed
      
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: false,
          timeSpent: newTotalTime,
          checkInTime: undefined // Updated line
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) throw updateError

      if (data) {
        setLoggedInUser({
          ...loggedInUser,
          isCheckedIn: false,
          timeSpent: newTotalTime,
          checkInTime: undefined
        })
        await fetchUsers() // Refresh the leaderboard
      }
    } catch (error) {
      console.error('Error checking out:', error)
      setError('Failed to check out. Please try again.')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!supabase) {
      setError('Application not properly initialized')
      return
    }

    if (!email.endsWith('@berkeley.edu')) {
      setError('Please use a valid Berkeley email address')
      return
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signInError) throw signInError

      setError('Check your email for the login link!')
    } catch (error) {
      console.error('Error during login:', error)
      setError('Failed to send login link. Please try again.')
    }
  }

  const handleSignOut = async () => {
    if (!supabase) return
    
    try {
      await supabase.auth.signOut()
      setLoggedInUser(null)
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <main className="container mx-auto p-6 max-w-5xl">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-6 w-6" />
            MoffittBoard
          </CardTitle>
          <CardDescription>Track your study time at Moffitt Library</CardDescription>
        </CardHeader>
      </Card>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {!loggedInUser ? (
        <Card>
          <CardHeader>
            <CardTitle>Login with Berkeley Email</CardTitle>
            <CardDescription>
              We'll send you a magic link to verify your email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@berkeley.edu"
                pattern=".+@berkeley\.edu"
                required
              />
              <Button type="submit">
                Send Magic Link
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Welcome, {loggedInUser.name}!</CardTitle>
              <CardDescription>
                Rank #{getUserRank(loggedInUser.id, users)}
                {getUserRank(loggedInUser.id, users) > 10 ? 
                  ` (out of ${users.length})` : 
                  ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Total time: {loggedInUser.timeSpent} minutes</span>
              </div>
              <div className="flex gap-2">
                {loggedInUser.isCheckedIn ? (
                  <Button 
                    variant="destructive"
                    onClick={handleCheckOut}
                  >
                    Check Out
                  </Button>
                ) : (
                  <Button 
                    variant="default"
                    onClick={handleCheckIn}
                  >
                    Check In
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Rankings</CardTitle>
              <CardDescription>Top students by study time</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Time (min)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users
                    .sort((a, b) => b.timeSpent - a.timeSpent)
                    .map((user, index) => (
                      <TableRow
                        key={user.id}
                        className={`${
                          loggedInUser?.id === user.id 
                            ? 'bg-blue-50 dark:bg-blue-900/20' 
                            : ''
                        } ${index < 3 ? getRankStyle(index) : ''}`}
                      >
                        <TableCell className="font-medium">
                          {getRankDisplay(index)}
                        </TableCell>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>{user.timeSpent}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

