import { useState } from 'react';
import { Search, Users, ArrowUpRight } from 'lucide-react';
import { TableSkeleton } from '../../../shared/components/Loading';
import { Avatar } from '../../../shared/components/Status';

export default function StudentsPage({ students, onSelect, loading = false }) {
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('all');
  const filtered = students.filter((student) => `${student.name} ${student.studentNo}`.toLowerCase().includes(search.toLowerCase()) && (course === 'all' || student.course === course));
  return <>
    <div className="page-heading"><div><h1>Students</h1><p>Student directory and linked gate activity</p></div><span className="count-label">{loading ? 'Retrieving students...' : students.length + ' students'}</span></div>
    <div className="table-toolbar"><label className="search-field"><Search size={16} /><span className="sr-only">Search students</span><input placeholder="Search name or student ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span className="sr-only">Course</span><select value={course} onChange={(event) => setCourse(event.target.value)}><option value="all">All courses</option>{[...new Set(students.map((student) => student.course))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
    {loading ? <TableSkeleton columns={['Student','Course','Year / section','Status','Action']} label="Retrieving students" /> : <><div className="table-scroll" role="region" aria-label="Students table" tabIndex={0}><table><thead><tr><th>Student</th><th>Course</th><th>Year / section</th><th>Status</th><th><span className="sr-only">View student</span></th></tr></thead><tbody>{filtered.map((student) => <tr key={student.id}><td><button className="person-button" onClick={() => onSelect(student)}><Avatar person={student} /><span><strong>{student.name}</strong><small>{student.studentNo}</small></span></button></td><td>{student.course}</td><td>{student.section}<small className="cell-small">{student.year}</small></td><td><span className="enrolled">{student.active ? 'Enrolled' : 'Inactive'}</span></td><td><button className="icon-button" title={`View ${student.name}`} aria-label={`View ${student.name}`} onClick={() => onSelect(student)}><ArrowUpRight size={17} /></button></td></tr>)}</tbody></table></div>
    {!filtered.length && <div className="empty-state"><Users size={26} /><h3>{students.length ? 'No matching students' : 'No student records'}</h3><p>{students.length ? 'Try a different name or course.' : 'Register a student to start building your directory.'}</p></div>}
    <div className="table-footer"><span>{filtered.length} students</span><span>Up to 1,000 records</span></div>
    </>}
  </>;
}
