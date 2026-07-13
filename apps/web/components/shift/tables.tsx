'use client';
import { useState, useEffect } from 'react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { parseShiftArray, type ShiftResponse } from '@/lib/shift';
import { GroupCode } from '@prisma/client';
import { format } from 'date-fns';
import '@/app/design/vtk-basic.css';
import { formatIsoTimeString } from '@fullcalendar/core/internal';
import { TIMEOUT } from 'node:dns/promises';

export function AvailableShiftsTable({ locale, userId }: { locale: Locale; userId: string }) {
  const dict = getDictionary(locale);

  const [shifts, setShifts] = useState<ShiftResponse[]>([]);

  useEffect(() => {
    async function getShifts() {
      const resp = await fetch('/api/shift');
      const data = await resp.json();

      setShifts(parseShiftArray(data));
    }

    getShifts();
  }, []);

  return (
    <div className="vtk-basic-table-wrap">
      <table className="vtk-basic-table">
        <thead>
          <tr>
            <th>Shift</th>
            <th>Date</th>
            <th>Time</th>
            <th>Where</th>
            <th>Register</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => {
            const date = format(shift.startTime, 'dd/MM/yyyy');
            const time = format(shift.startTime, 'hh:mm') + '-' + format(shift.endTime, 'hh:mm');
            return (
              <tr key={shift.id}>
                <td>{shift.name}</td>
                <td>{date}</td>
                <td>{time}</td>
                <td>{shift.location}</td>
                <td>
                  <span className="vtk-basic-badge vtk-basic-badge-success">
                    Registreer ({shift.takenSpots}/{shift.maxParticipants})
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RegisteredShiftsTable({ locale, userId }: { locale: Locale; userId: string }) {
  const dict = getDictionary(locale);

  const [shifts, setShifts] = useState<ShiftResponse[]>([]);

  useEffect(() => {
    async function getShifts() {
      const resp = await fetch('/api/shift/register');
      const data = await resp.json();

      setShifts(parseShiftArray(data));
    }

    getShifts();
  }, []);

  return (
    <div className="vtk-basic-table-wrap">
      <table className="vtk-basic-table">
        <thead>
          <tr>
            <th>Shift</th>
            <th>Date</th>
            <th>Time</th>
            <th>Where</th>
            <th>Register</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => {
            const date = format(shift.startTime, 'dd/MM/yyyy');
            const time = format(shift.startTime, 'hh:mm') + '-' + format(shift.endTime, 'hh:mm');
            return (
              <tr key={shift.id}>
                <td>{shift.name}</td>
                <td>{date}</td>
                <td>{time}</td>
                <td>{shift.location}</td>
                <td>
                  <span className="vtk-basic-badge vtk-basic-badge-success">Registreer (0/4)</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
