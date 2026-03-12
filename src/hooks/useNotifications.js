import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

const STORAGE_KEY = 'jira_notif_reviewed';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getReviewedIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveReviewedIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function useNotifications(project = 'PY06809') {
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [rawEntries, setRawEntries] = useState([]);
  const [reviewedIds, setReviewedIds] = useState(getReviewedIds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const timerRef = useRef(null);

  // Fetch current user email once
  useEffect(() => {
    api.health().then(data => {
      if (data?.email) setCurrentUserEmail(data.email.toLowerCase().trim());
      else if (data?.user) setCurrentUserEmail(data.user.toLowerCase().trim());
    }).catch(() => {});
  }, []);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getActivityFeed(project, 5, 40);
      setRawEntries(data.entries || []);
      setLastFetched(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [project]);

  // Initial fetch + polling
  useEffect(() => {
    fetchFeed();

    timerRef.current = setInterval(fetchFeed, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchFeed]);

  // Build filtered + annotated notifications
  const notifications = rawEntries
    .filter(entry => {
      if (!currentUserEmail) return true; // show all if user unknown
      const authorEmail = (entry.author?.email || '').toLowerCase().trim();
      // Filter out entries authored by the current user
      return authorEmail !== currentUserEmail && authorEmail !== '';
    })
    .map(entry => ({
      ...entry,
      reviewed: reviewedIds.includes(entry.id),
    }));

  const unreadCount = notifications.filter(n => !n.reviewed).length;

  const markAsReviewed = useCallback((id) => {
    setReviewedIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveReviewedIds(next);
      return next;
    });
  }, []);

  const markAllReviewed = useCallback(() => {
    setReviewedIds(prev => {
      const newIds = notifications
        .map(n => n.id)
        .filter(id => !prev.includes(id));
      if (newIds.length === 0) return prev;
      const next = [...prev, ...newIds];
      saveReviewedIds(next);
      return next;
    });
  }, [notifications]);

  const refresh = useCallback(() => {
    fetchFeed();
  }, [fetchFeed]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    lastFetched,
    markAsReviewed,
    markAllReviewed,
    refresh,
  };
}
