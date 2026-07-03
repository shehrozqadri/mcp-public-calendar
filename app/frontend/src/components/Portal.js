import React, { useState, useEffect } from 'react';
import { LogOut, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, MapPin, Users, RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import MongoLogo from './MongoLogo';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const Portal = ({ user, onLogout }) => {
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filters, setFilters] = useState({
    location: 'all',
    track: 'all'
  });
  const [sseStatus, setSseStatus] = useState('disconnected');
  const [locations, setLocations] = useState(['Pune', 'Others']);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCourses();
    loadBatches();
    setupSSE();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadCourses = async () => {
    try {
      const response = await fetch(`${API_URL}/api/courses`, {
        credentials: 'include'
      });
      const data = await response.json();
      setCourses(data.courses || []);
      
      const courseTracks = data.courses?.map(c => c.track_filter) || [];
      const uniqueTracks = [...new Set(courseTracks)];
      setTracks(prev => [...new Set([...prev, ...uniqueTracks])]);
    } catch (error) {
      console.error('Failed to load courses:', error);
    }
  };

  const loadBatches = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'Accepting Nominations',
        ...(filters.location !== 'all' && { location: filters.location }),
        ...(filters.track !== 'all' && { track: filters.track })
      });
      
      const response = await fetch(`${API_URL}/api/batches?${params}`, {
        credentials: 'include'
      });
      const data = await response.json();
      setBatches(data);
      
      const batchLocations = [...new Set(data.map(b => b.location))].sort();
      const allLocations = ['Pune', ...batchLocations.filter(l => l !== 'Pune'), 'Others'];
      setLocations([...new Set(allLocations)]);
      
      const batchTracks = [...new Set(data.map(b => b.track))].sort();
      setTracks(prev => [...new Set([...prev, ...batchTracks])]);
    } catch (error) {
      console.error('Failed to load batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupSSE = () => {
    setSseStatus('connecting');
    const eventSource = new EventSource(`${API_URL}/api/sse/batches`, {
      withCredentials: true
    });

    let connectionTimeout = setTimeout(() => {
      if (sseStatus !== 'connected') {
        console.log('SSE connection timeout, continuing with polling');
        setSseStatus('connected');
      }
    }, 3000);

    eventSource.onopen = () => {
      console.log('SSE connection opened');
      setSseStatus('connected');
      clearTimeout(connectionTimeout);
    };

    eventSource.onmessage = (event) => {
      try {
        if (event.data && event.data.trim()) {
          const data = JSON.parse(event.data);
          setBatches(data);
          setSseStatus('connected');
          clearTimeout(connectionTimeout);
        }
      } catch (error) {
        console.error('SSE parse error:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setSseStatus('reconnecting');
      eventSource.close();
      clearTimeout(connectionTimeout);
      setTimeout(() => setupSSE(), 5000);
    };

    return () => {
      eventSource.close();
      clearTimeout(connectionTimeout);
    };
  };

  const getSeatColor = (batch) => {
    const seats = batch.available_seats;
    const capacity = batch.max_capacity;
    const percentage = (seats / capacity) * 100;

    if (seats === 0) return 'text-rose-500';
    if (seats <= 3 || percentage <= 20) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getSeatDotClass = () => {
    if (sseStatus === 'connected') return 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]';
    if (sseStatus === 'reconnecting') return 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]';
    return 'w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(225,29,72,0.8)]';
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const getBatchesForDay = (day) => {
      return batches.filter(batch => {
        const startDate = parseISO(batch.start_date);
        const endDate = parseISO(batch.end_date);
        return day >= startDate && day <= endDate;
      });
    };

    return (
      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-mono uppercase tracking-wider text-emerald-400 py-2">
            {day}
          </div>
        ))}
        {days.map((day, idx) => {
          const dayBatches = getBatchesForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          
          return (
            <div
              key={idx}
              className={`min-h-[120px] border border-slate-800 rounded-lg p-2 ${
                isCurrentMonth ? 'bg-slate-900' : 'bg-slate-950 opacity-40'
              }`}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
            >
              <div className="text-sm font-medium text-slate-300 mb-1">
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {dayBatches.map(batch => (
                  <div
                    key={batch.batch_id}
                    className="text-xs p-1 bg-slate-800 hover:bg-slate-700 rounded cursor-pointer border-l-2 border-emerald-500 transition-colors"
                    data-testid={`batch-event-${batch.batch_no}`}
                  >
                    <div className="font-mono text-emerald-400">#{batch.batch_no}</div>
                    <div className="text-slate-400 truncate">{batch.location}</div>
                    <div className="text-slate-300 truncate text-[10px]">{batch.track}</div>
                    <div className={`font-medium ${getSeatColor(batch)}`}>
                      {batch.available_seats} seats
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-slate-950/80 border-b border-slate-800 h-16 flex items-center px-6">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <MongoLogo size={32} />
            <div>
              <h1 className="text-xl font-heading font-semibold text-slate-50 leading-tight">MongoDB Certification Program</h1>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">MCP Portal</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className={getSeatDotClass()} data-testid="sse-status-indicator"></div>
              <span className="text-xs text-emerald-400 font-mono uppercase tracking-wider">
                {sseStatus === 'connected' ? 'Live' : sseStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-300">
                {user.organization_name} · {user.customer_name}
              </div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
            <button
              onClick={onLogout}
              data-testid="logout-button"
              className="flex items-center gap-2 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 h-[calc(100vh-4rem)]">
        {/* Left Panel - Course Catalog */}
        <div className="col-span-1 lg:col-span-4 border-r border-slate-800 bg-slate-950 overflow-y-auto scrollbar-hide" data-testid="course-catalog-panel">
          <div className="p-6">
            <h2 className="text-xl font-heading font-medium text-slate-50 mb-4">Training Courses</h2>
            <div className="space-y-3">
              {courses.map((course, idx) => (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourse(course)}
                  className="bg-slate-900 border border-slate-800 p-4 rounded-lg hover:border-emerald-500/50 hover:bg-slate-800/50 cursor-pointer transition-all"
                  data-testid={`course-catalog-item-${idx}`}
                >
                  <h3 className="font-heading font-medium text-slate-50 mb-1">{course.short_title}</h3>
                  <p className="text-sm text-slate-400">{course.duration} · {course.format}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilters({ ...filters, track: course.track_filter });
                    }}
                    className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    data-testid={`show-batches-button-${idx}`}
                  >
                    Show batches: {course.track_filter}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Calendar */}
        <div className="col-span-1 lg:col-span-8 bg-slate-900 p-6 overflow-y-auto scrollbar-hide" data-testid="calendar-panel">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <span className="text-sm text-emerald-400 font-medium">Accepting Nominations</span>
                </div>
                <button
                  onClick={loadBatches}
                  disabled={loading}
                  className="p-2 hover:bg-slate-800 rounded-md transition-colors"
                  data-testid="refresh-batches-button"
                >
                  <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 hover:bg-slate-800 rounded-md transition-colors"
                  data-testid="calendar-prev-month"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-300" />
                </button>
                <h2 className="text-xl font-heading font-medium text-slate-50 min-w-[200px] text-center">
                  {format(currentMonth, 'MMMM yyyy')}
                </h2>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 hover:bg-slate-800 rounded-md transition-colors"
                  data-testid="calendar-next-month"
                >
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-md border border-slate-700 transition-colors"
                  data-testid="calendar-today-button"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <select
                  value={filters.location}
                  onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                  className="bg-slate-950 border border-slate-800 text-slate-50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                  data-testid="location-filter"
                >
                  <option value="all">All Locations</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <select
                  value={filters.track}
                  onChange={(e) => setFilters({ ...filters, track: e.target.value })}
                  className="bg-slate-950 border border-slate-800 text-slate-50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                  data-testid="track-filter"
                >
                  <option value="all">All Tracks</option>
                  {tracks.map(track => (
                    <option key={track} value={track}>{track}</option>
                  ))}
                </select>
              </div>

              {(filters.location !== 'all' || filters.track !== 'all') && (
                <button
                  onClick={() => setFilters({ location: 'all', track: 'all' })}
                  className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                  data-testid="clear-filters-button"
                >
                  Clear filters
                </button>
              )}

              <div className="ml-auto text-sm text-slate-400">
                {batches.length} {batches.length === 1 ? 'batch' : 'batches'} shown
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          {renderCalendar()}

          {batches.length === 0 && (
            <div className="text-center py-12 text-slate-500" data-testid="no-batches-message">
              No batches match your filters
            </div>
          )}
        </div>
      </div>

      {/* Course Detail Slide-over */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end" onClick={() => setSelectedCourse(null)}>
          <div
            className="w-full md:w-[480px] h-full bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto transform transition-transform duration-300"
            onClick={(e) => e.stopPropagation()}
            data-testid="course-detail-panel"
          >
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-heading font-medium text-slate-50">{selectedCourse.title}</h2>
              <button
                onClick={() => setSelectedCourse(null)}
                className="p-2 hover:bg-slate-800 rounded-md transition-colors"
                data-testid="close-course-detail"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <p className="text-slate-300 leading-relaxed">{selectedCourse.summary}</p>
                <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-4 h-4" />
                    {selectedCourse.duration}
                  </span>
                  <span>{selectedCourse.format}</span>
                </div>
              </div>

              {selectedCourse.slides?.map((slide, idx) => (
                <div key={idx} className="space-y-3">
                  <h3 className="text-xl font-heading font-medium text-slate-50">{slide.heading}</h3>
                  {slide.body && <p className="text-slate-300 leading-relaxed">{slide.body}</p>}
                  {slide.bullets && (
                    <ul className="space-y-2">
                      {slide.bullets.map((bullet, bidx) => (
                        <li key={bidx} className="flex items-start gap-3 text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0"></span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  setFilters({ ...filters, track: selectedCourse.track_filter });
                  setSelectedCourse(null);
                }}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium px-6 py-3 rounded-md transition-colors"
                data-testid="show-batches-from-detail"
              >
                Show batches for this course
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Portal;
