import React, { useState, useEffect } from 'react';
import { LogOut, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, MapPin, Users, RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, startOfDay, isBefore, isAfter } from 'date-fns';
import MongoLogo from './MongoLogo';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const getBatchVisibility = (batch) =>
  String(batch.visibility || 'PUBLIC').toUpperCase();

const getVisibleBatches = (batchList) =>
  batchList.filter((batch) => getBatchVisibility(batch) === 'PUBLIC');

const getWeekSegments = (weekDays, batchList) => {
  const weekStart = startOfDay(weekDays[0]);
  const weekEnd = startOfDay(weekDays[6]);

  return batchList
    .map((batch) => {
      const start = startOfDay(parseISO(batch.start_date));
      const end = startOfDay(parseISO(batch.end_date));
      if (isAfter(start, weekEnd) || isBefore(end, weekStart)) return null;

      let colStart = 0;
      for (let i = 0; i < weekDays.length; i += 1) {
        if (!isBefore(startOfDay(weekDays[i]), start)) {
          colStart = i;
          break;
        }
      }

      let colEnd = weekDays.length - 1;
      for (let i = weekDays.length - 1; i >= 0; i -= 1) {
        if (!isAfter(startOfDay(weekDays[i]), end)) {
          colEnd = i;
          break;
        }
      }

      return {
        batch,
        colStart,
        colEnd,
        span: colEnd - colStart + 1,
      };
    })
    .filter(Boolean);
};

const assignSegmentRows = (segments) => {
  const sorted = [...segments].sort(
    (a, b) => a.colStart - b.colStart || b.span - a.span
  );
  const rows = [];

  sorted.forEach((segment) => {
    let row = 0;
    while (
      rows[row]?.some(
        (existing) =>
          !(segment.colEnd < existing.colStart || segment.colStart > existing.colEnd)
      )
    ) {
      row += 1;
    }
    if (!rows[row]) rows[row] = [];
    rows[row].push({ ...segment, row });
  });

  return rows.flat();
};

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
  const [coursesError, setCoursesError] = useState('');

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
      setCoursesError('');
      const response = await fetch(`${API_URL}/api/courses`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to load courses');
      }
      const data = await response.json();
      setCourses(data.courses || []);
      
      const courseTracks = data.courses?.map(c => c.track_filter) || [];
      const uniqueTracks = [...new Set(courseTracks)];
      setTracks(prev => [...new Set([...prev, ...uniqueTracks])]);
    } catch (error) {
      console.error('Failed to load courses:', error);
      setCoursesError('Unable to load training courses. Please refresh the page.');
    }
  };

  const renderCourseDetail = (course) => (
    <div className="space-y-6" data-testid="course-detail-inline">
      <div>
        <h3 className="text-2xl font-heading font-medium text-slate-50 mb-2">{course.title}</h3>
        {(course.level || course.audience || course.prerequisites) && (
          <div className="mb-3 space-y-1 text-sm text-slate-400">
            {course.level && <p><span className="text-slate-300">Level:</span> {course.level}</p>}
            {course.audience && <p><span className="text-slate-300">Audience:</span> {course.audience}</p>}
            {course.prerequisites && <p><span className="text-slate-300">Prerequisites:</span> {course.prerequisites}</p>}
          </div>
        )}
        <p className="text-slate-300 leading-relaxed">{course.summary}</p>
        <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
          <span className="flex items-center gap-1">
            <CalendarIcon className="w-4 h-4" />
            {course.duration}
          </span>
          <span>{course.format}</span>
        </div>
      </div>

      {course.slides?.map((slide, idx) => (
        <div key={idx} className="space-y-3">
          <h4 className="text-lg font-heading font-medium text-slate-50">{slide.heading}</h4>
          {slide.body && <p className="text-slate-300 leading-relaxed text-sm">{slide.body}</p>}
          {slide.bullets && (
            <ul className="space-y-2">
              {slide.bullets.map((bullet, bidx) => (
                <li key={bidx} className="flex items-start gap-3 text-slate-300 text-sm">
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
          setFilters({ ...filters, track: course.track_filter });
        }}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium px-6 py-3 rounded-md transition-colors"
        data-testid="show-batches-from-detail"
      >
        Show batches for this course
      </button>
    </div>
  );

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

  const getSeatDotClass = () => {
    if (sseStatus === 'connected') return 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]';
    if (sseStatus === 'reconnecting') return 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]';
    return 'w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(225,29,72,0.8)]';
  };

  const renderBatchBar = (batch) => {
    const visibility = getBatchVisibility(batch);

    return (
      <div
        className="flex h-7 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-emerald-600/40 bg-emerald-500 text-[11px] shadow-sm"
        title={`${batch.training_name} · ${batch.location}`}
        data-testid={`batch-event-${batch.batch_no}`}
      >
        <span className="flex shrink-0 items-center bg-emerald-600 px-2 font-semibold text-white">
          Batch {batch.batch_no}
        </span>
        <span className="flex shrink-0 items-center bg-emerald-700 px-2 text-[10px] font-bold tracking-wide text-white">
          {visibility}
        </span>
        <span className="flex min-w-0 flex-1 items-center truncate bg-white px-2 font-medium text-slate-800">
          {batch.training_name || batch.track}
        </span>
      </div>
    );
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const visibleBatches = getVisibleBatches(batches);

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              {day}
            </div>
          ))}
        </div>

        {weeks.map((weekDays, weekIdx) => {
          const segments = assignSegmentRows(getWeekSegments(weekDays, visibleBatches));
          const maxRow = segments.reduce((max, segment) => Math.max(max, segment.row), -1);
          const eventRows = maxRow + 1;
          const weekHeight = 72 + Math.max(eventRows, 1) * 32;

          return (
            <div
              key={weekIdx}
              className="relative border-b border-gray-200 last:border-b-0"
              style={{ minHeight: `${weekHeight}px` }}
            >
              <div className="grid h-full grid-cols-7 divide-x divide-gray-200">
                {weekDays.map((day, dayIdx) => {
                  const isCurrentMonth = isSameMonth(day, currentMonth);

                  return (
                    <div
                      key={dayIdx}
                      className={`flex min-h-[72px] flex-col justify-end p-2 ${
                        isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                      }`}
                      data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 top-2 grid gap-y-1 px-1"
                style={{
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gridTemplateRows: `repeat(${Math.max(eventRows, 1)}, 28px)`,
                }}
              >
                {segments.map((segment) => (
                  <div
                    key={`${segment.batch.batch_id}-${weekIdx}-${segment.row}`}
                    className="pointer-events-auto px-0.5"
                    style={{
                      gridColumn: `${segment.colStart + 1} / span ${segment.span}`,
                      gridRow: segment.row + 1,
                    }}
                  >
                    {renderBatchBar(segment.batch)}
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

            {coursesError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-md text-sm">
                {coursesError}
              </div>
            )}

            <div className="space-y-3">
              {courses.map((course, idx) => (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourse(course)}
                  className={`bg-slate-900 border p-4 rounded-lg hover:border-emerald-500/50 hover:bg-slate-800/50 cursor-pointer transition-all ${
                    selectedCourse?.id === course.id
                      ? 'border-emerald-500 bg-slate-800/70'
                      : 'border-slate-800'
                  }`}
                  data-testid={`course-catalog-item-${idx}`}
                >
                  <h3 className="font-heading font-medium text-slate-50 mb-1">{course.short_title}</h3>
                  <p className="text-sm text-slate-400">{course.duration} · {course.format}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCourse(course);
                      setFilters({ ...filters, track: course.track_filter });
                    }}
                    className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    data-testid={`show-batches-button-${idx}`}
                  >
                    Show batches: {course.track_filter}
                  </button>
                </div>
              ))}

              {courses.length === 0 && !coursesError && (
                <p className="text-sm text-slate-500">No courses available.</p>
              )}
            </div>

            {selectedCourse && (
              <div className="mt-6 pt-6 border-t border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-heading font-medium text-emerald-400">Course Details</h3>
                  <button
                    onClick={() => setSelectedCourse(null)}
                    className="p-2 hover:bg-slate-800 rounded-md transition-colors"
                    data-testid="close-course-detail"
                    aria-label="Close course details"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                {renderCourseDetail(selectedCourse)}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Calendar */}
        <div className="col-span-1 lg:col-span-8 bg-slate-100 p-6 overflow-y-auto scrollbar-hide" data-testid="calendar-panel">
          <div className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-heading font-semibold text-gray-900">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                  data-testid="calendar-today-button"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition-colors hover:bg-gray-50"
                  data-testid="calendar-prev-month"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition-colors hover:bg-gray-50"
                  data-testid="calendar-next-month"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
                  <span className="text-sm font-medium text-emerald-700">Accepting Nominations</span>
                </div>
                <div className="rounded-full border border-gray-200 bg-white px-3 py-1">
                  <span className="text-sm font-medium text-gray-600">Public batches only</span>
                </div>
                <button
                  onClick={loadBatches}
                  disabled={loading}
                  className="rounded-md border border-gray-300 bg-white p-2 transition-colors hover:bg-gray-50"
                  data-testid="refresh-batches-button"
                  aria-label="Refresh batches"
                >
                  <RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <select
                  value={filters.location}
                  onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-emerald-500"
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
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-emerald-500"
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

              <div className="ml-auto text-sm text-gray-500">
                {getVisibleBatches(batches).length}{' '}
                {getVisibleBatches(batches).length === 1 ? 'public batch' : 'public batches'} shown
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          {renderCalendar()}

          {getVisibleBatches(batches).length === 0 && (
            <div className="text-center py-12 text-gray-500" data-testid="no-batches-message">
              No public batches match your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Portal;
