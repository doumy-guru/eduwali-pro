import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Users, BookOpen, AlertCircle, CheckCircle, FileSpreadsheet, Plus, Search, ChevronRight, User, Key, LogOut, Send, Download, Trash2, Edit3, ShieldAlert } from 'lucide-react';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "mock-key", authDomain: "mock-domain", projectId: "mock-project", storageBucket: "mock-bucket", messagingSenderId: "mock-sender", appId: "mock-app"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'eduwali-pro-default';

const DATA_COLUMNS = [
  "Nama", "NISN", "Status", "Jenis Kelamin", "Tempat Lahir", "Tanggal Lahir", "Agama",
  "Nomor HP", "Golongan Darah", "Alamat", "Desa", "Kecamatan", "Kabupaten",
  "Saudara Kandung", "Anak Ke", "Nama Ayah", "Nama Ibu", "Orang Tua Yang Masih Hidup",
  "Pendidikan Ayah", "Pendidikan Ibu", "Pekerjaan Ayah", "Pekerjaan Ibu",
  "Penghasilan Ayah", "Penghasilan Ibu", "HP Ayah", "HP Ibu", "Jumlah Tanggungan"
];

// Replaced XLSX with simple CSV generation
const generateCSVTemplate = () => {
  const csvContent = "data:text/csv;charset=utf-8," + DATA_COLUMNS.join(",") + "\n";
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Template_EduWali_Pro.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Replaced XLSX parsing with basic CSV parsing
const readCSVData = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const result = [];
        
        for(let i = 1; i < lines.length; i++) {
          if(!lines[i].trim()) continue;
          const currentline = lines[i].split(',');
          const obj = {};
          headers.forEach((header, index) => {
             // Handle cases where commas might be inside quotes (simplified for MVP)
            obj[header] = currentline[index] ? currentline[index].trim() : '';
          });
          result.push(obj);
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-2xl" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col`}>
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

const PortalSiswa = ({ guruId, studentNisn, onLogout }) => {
  const [studentData, setStudentData] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [activeTab, setActiveTab] = useState('profil');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({});

  useEffect(() => {
    if (!guruId || !studentNisn) return;

    // Fetch public mapping to find student ID
    const publicMappingRef = doc(db, 'artifacts', appId, 'public', 'data', 'teacher_students', guruId);
    
    const unsubscribeMapping = onSnapshot(publicMappingRef, (docSnap) => {
      if (docSnap.exists()) {
        const mapping = docSnap.data().students || {};
        const studentId = mapping[studentNisn];
        
        if (studentId) {
          // Listen to specific student's public doc
          const studentRef = doc(db, 'artifacts', appId, 'public', 'data', 'students_data', studentId);
          onSnapshot(studentRef, (sDoc) => {
            if(sDoc.exists()){
                const data = {id: sDoc.id, ...sDoc.data()};
                setStudentData(data);
                setEditProfileData(data);
            } else {
                setStudentData(null);
            }
            setLoading(false);
          });

          // Fetch public cases for this student
          const casesQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'cases_data'));
          onSnapshot(casesQuery, (snapshot) => {
             const allCases = [];
             snapshot.forEach(d => {
                 if(d.data().studentId === studentId) {
                     allCases.push({id: d.id, ...d.data()});
                 }
             });
             setCases(allCases.sort((a, b) => b.date - a.date));
          })

        } else {
          setLoading(false); // Nisn not found in mapping
        }
      } else {
        setLoading(false); // Mapping doc doesn't exist
      }
    }, (error) => {
      console.error("Error fetching student:", error);
      setLoading(false);
    });

    return () => unsubscribeMapping();
  }, [guruId, studentNisn]);

  const handleSubmitReply = async (caseId) => {
      if(!replyText.trim()) return;
      try {
          const caseRef = doc(db, 'artifacts', appId, 'public', 'data', 'cases_data', caseId);
          const theCase = cases.find(c => c.id === caseId);
          const updatedResponses = [...(theCase.responses || []), {
              sender: 'Siswa',
              text: replyText,
              date: Date.now()
          }];
          await updateDoc(caseRef, { responses: updatedResponses });
          setReplyText('');
      } catch (err) {
          console.error("Failed to submit reply:", err);
      }
  };

  const handleUpdateProfile = async () => {
      try {
          const studentRef = doc(db, 'artifacts', appId, 'public', 'data', 'students_data', studentData.id);
          
          // Ensure they don't overwrite locked fields like Nama, NISN, Status, Poin, Absensi, Karakter
          const safeData = { ...editProfileData };
          delete safeData.Nama;
          delete safeData.NISN;
          delete safeData.Status;
          delete safeData.poin;
          delete safeData.absensi;
          delete safeData.karakter;
          delete safeData.pin;

          await updateDoc(studentRef, safeData);
          setIsEditingProfile(false);
          alert("Biodata berhasil diperbarui. Wali kelas akan melihat perubahan ini.");
      } catch (err) {
          console.error("Gagal update profil", err);
          alert("Gagal memperbarui profil. Coba lagi.");
      }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (!studentData) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-sm"><AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" /><h2 className="text-xl font-bold mb-2 text-gray-800">Akses Ditolak</h2><p className="text-gray-600 mb-6 text-sm">Data tidak ditemukan. Pastikan ID Guru dan NISN benar.</p><button onClick={onLogout} className="btn-primary w-full">Kembali ke Login</button></div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white p-4 shadow-md">
        <div className="container mx-auto max-w-4xl flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BookOpen size={24} />
            <div>
                <h1 className="text-xl font-bold leading-tight">Portal Siswa</h1>
                <p className="text-indigo-200 text-xs">EduWali Pro</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 px-3 py-1.5 text-sm rounded-lg transition-colors">
            <LogOut size={16} /> Keluar
          </button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl p-4 mt-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
            <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-100 p-4 rounded-full">
                        <User className="h-8 w-8 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">{studentData.Nama}</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-gray-500 text-sm">NISN: {studentData.NISN}</span>
                            <span className="text-gray-300">•</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${studentData.Status === 'Wali Kelas' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>Siswa {studentData.Status}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex border-b border-gray-200 overflow-x-auto">
                <button onClick={() => setActiveTab('profil')} className={`flex-1 py-4 px-6 text-center font-medium transition-colors whitespace-nowrap ${activeTab === 'profil' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>Profil & Akademik</button>
                <button onClick={() => setActiveTab('kasus')} className={`flex-1 py-4 px-6 text-center font-medium transition-colors whitespace-nowrap ${activeTab === 'kasus' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>Ruang Konseling & Kasus</button>
            </div>

            <div className="p-6">
                {activeTab === 'profil' && (
                    <div className="space-y-8">
                        {/* Akademik Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex flex-col justify-center">
                                <h3 className="text-sm font-semibold text-blue-800 mb-1">Total Ketidakhadiran</h3>
                                <div className="flex items-end gap-2">
                                    <p className="text-3xl font-bold text-blue-900">{studentData.absensi?.S + studentData.absensi?.I + studentData.absensi?.A || 0}</p>
                                    <span className="text-sm text-blue-700 mb-1">Hari</span>
                                </div>
                                <div className="text-xs text-blue-800 mt-2 flex gap-3 font-medium bg-blue-100/50 p-2 rounded-lg">
                                    <span>S: {studentData.absensi?.S || 0}</span>
                                    <span>I: {studentData.absensi?.I || 0}</span>
                                    <span className={studentData.absensi?.A > 0 ? "text-red-600 font-bold" : ""}>A: {studentData.absensi?.A || 0}</span>
                                </div>
                            </div>
                            <div className="bg-red-50 p-5 rounded-xl border border-red-100 flex flex-col justify-center">
                                <h3 className="text-sm font-semibold text-red-800 mb-1">Poin Pelanggaran</h3>
                                <p className="text-4xl font-bold text-red-900">{studentData.poin || 0}</p>
                                <p className="text-xs text-red-700 mt-2 opacity-80">Harap jaga sikap untuk menghindari sanksi.</p>
                            </div>
                            <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100">
                                <h3 className="text-sm font-semibold text-emerald-800 mb-3">Nilai Karakter</h3>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="flex justify-between border-b border-emerald-200 pb-1"><span>Spiritual:</span> <span className="font-bold text-emerald-900">{studentData.karakter?.spiritual || '-'}</span></div>
                                    <div className="flex justify-between border-b border-emerald-200 pb-1"><span>Sosial:</span> <span className="font-bold text-emerald-900">{studentData.karakter?.sosial || '-'}</span></div>
                                    <div className="flex justify-between border-b border-emerald-200 pb-1"><span>Disiplin:</span> <span className="font-bold text-emerald-900">{studentData.karakter?.kedisiplinan || '-'}</span></div>
                                    <div className="flex justify-between border-b border-emerald-200 pb-1"><span>T.Jawab:</span> <span className="font-bold text-emerald-900">{studentData.karakter?.tanggungjawab || '-'}</span></div>
                                </div>
                                {studentData.karakter?.catatan && (
                                    <p className="mt-2 text-xs italic text-emerald-800 bg-emerald-100 p-2 rounded">"{studentData.karakter.catatan}"</p>
                                )}
                            </div>
                        </div>

                        {/* Biodata Management */}
                        <div>
                            <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 className="text-lg font-bold text-gray-800">Biodata Lengkap</h3>
                                {!isEditingProfile ? (
                                    <button onClick={() => setIsEditingProfile(true)} className="flex items-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors font-medium">
                                        <Edit3 size={16}/> Perbarui Data
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button onClick={() => {setIsEditingProfile(false); setEditProfileData(studentData);}} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors">Batal</button>
                                        <button onClick={handleUpdateProfile} className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">Simpan</button>
                                    </div>
                                )}
                            </div>

                            <div className="bg-amber-50 text-amber-800 text-sm p-3 rounded-lg mb-4 flex items-start gap-2 border border-amber-200">
                                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                                <p>Pastikan data diri, kontak, dan informasi orang tua/wali selalu valid untuk memudahkan komunikasi sekolah.</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-sm bg-gray-50 p-6 rounded-xl border border-gray-100">
                                {DATA_COLUMNS.filter(c => c !== 'Nama' && c !== 'NISN' && c !== 'Status').map(col => (
                                    <div key={col} className="flex flex-col">
                                        <label className="text-gray-500 font-medium mb-1">{col}</label>
                                        {isEditingProfile ? (
                                            <input 
                                                type="text" 
                                                className="input-field bg-white" 
                                                value={editProfileData[col] || ''} 
                                                onChange={(e) => setEditProfileData({...editProfileData, [col]: e.target.value})}
                                            />
                                        ) : (
                                            <div className="font-medium text-gray-800 bg-white p-2 rounded-lg border border-gray-200 shadow-sm min-h-[36px]">{studentData[col] || '-'}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'kasus' && (
                    <div className="space-y-6">
                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-4">
                            <h3 className="font-bold text-indigo-900 mb-1">Ruang Komunikasi Wali Kelas</h3>
                            <p className="text-sm text-indigo-800">Gunakan ruang ini untuk mengklarifikasi kejadian, membalas catatan konseling, atau berdiskusi dengan wali kelas secara privat.</p>
                        </div>
                        {cases.length === 0 ? (
                             <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                                 <CheckCircle className="mx-auto h-12 w-12 text-emerald-400 mb-3" />
                                 <p className="font-medium text-gray-700">Tidak ada catatan kasus atau teguran.</p>
                                 <p className="text-sm mt-1">Pertahankan sikap baikmu!</p>
                             </div>
                        ) : cases.map((c) => (
                            <div key={c.id} className="border border-gray-200 rounded-xl p-5 shadow-sm bg-white">
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-bold text-lg text-gray-800">{c.title}</h4>
                                    <span className={`px-2.5 py-1 text-xs rounded-full font-bold ${
                                        c.status === 'Selesai' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 
                                        c.status === 'Dalam Pantauan' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-red-100 text-red-800 border border-red-200'
                                    }`}>{c.status}</span>
                                </div>
                                <p className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-1"><BookOpen size={12}/> Dicatat pada: {new Date(c.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <div className="text-gray-700 mb-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm leading-relaxed">
                                    <span className="font-semibold block mb-1 text-xs text-gray-500 uppercase tracking-wider">Deskripsi / Catatan Wali Kelas:</span>
                                    {c.description}
                                </div>
                                
                                <div className="space-y-4 border-t border-gray-100 pt-4">
                                    <h5 className="text-sm font-bold text-gray-700">Diskusi & Klarifikasi:</h5>
                                    <div className="space-y-3">
                                        {c.responses?.map((r, i) => (
                                            <div key={i} className={`p-3 rounded-xl text-sm w-3/4 ${r.sender === 'Guru' ? 'bg-indigo-50 border border-indigo-100 mr-auto' : 'bg-blue-50 border border-blue-100 ml-auto'}`}>
                                                <p className="font-bold text-xs mb-1 opacity-70 flex justify-between">
                                                    <span>{r.sender}</span> 
                                                    <span className="font-normal">{new Date(r.date).toLocaleDateString()}</span>
                                                </p>
                                                <p className="text-gray-800">{r.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {c.status !== 'Selesai' && (
                                        <div className="flex gap-2 mt-4">
                                            <input 
                                                type="text" 
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSubmitReply(c.id)}
                                                placeholder="Ketik tanggapan, klarifikasi, atau permintaan maaf..." 
                                                className="input-field flex-1 text-sm bg-gray-50"
                                            />
                                            <button onClick={() => handleSubmitReply(c.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 font-medium transition-colors">
                                                Kirim <Send size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
};

const Dashboard = ({ user, students, cases }) => {
  const stats = useMemo(() => {
    let total = students.length;
    let waliKelas = students.filter(s => s.Status === 'Wali Kelas').length;
    let bimbingan = students.filter(s => s.Status === 'Bimbingan').length;
    let highPoints = students.filter(s => (s.poin || 0) > 20).length;
    let activeCases = cases.filter(c => c.status !== 'Selesai').length;
    let completeProfiles = students.filter(s => DATA_COLUMNS.every(col => s[col] && s[col].toString().trim() !== '')).length;
    let highAbsence = students.filter(s => ((s.absensi?.S || 0) + (s.absensi?.I || 0) + (s.absensi?.A || 0)) > 5).length;

    return { total, waliKelas, bimbingan, highPoints, activeCases, completeProfiles, highAbsence };
  }, [students, cases]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Dashboard Utama</h2>
            <p className="text-gray-500 text-sm">Ringkasan data kelas dan siswa bimbingan Anda.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-50 p-3 rounded-xl"><Users className="text-indigo-600" size={24} /></div>
          </div>
          <div>
              <p className="text-3xl font-bold text-gray-800 mb-1">{stats.total}</p>
              <p className="text-sm text-gray-500 font-medium">Total Siswa Dikelola</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
              <div className="bg-blue-50 p-3 rounded-xl"><BookOpen className="text-blue-600" size={24} /></div>
          </div>
          <div>
              <p className="text-3xl font-bold text-gray-800 mb-1">{stats.waliKelas}</p>
              <p className="text-sm text-gray-500 font-medium">Siswa Wali Kelas</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
              <div className="bg-purple-50 p-3 rounded-xl"><User className="text-purple-600" size={24} /></div>
          </div>
          <div>
              <p className="text-3xl font-bold text-gray-800 mb-1">{stats.bimbingan}</p>
              <p className="text-sm text-gray-500 font-medium">Siswa Bimbingan</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldAlert size={80} className="text-red-500" /></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="bg-red-50 p-3 rounded-xl"><AlertCircle className="text-red-600" size={24} /></div>
          </div>
          <div className="relative z-10">
              <p className="text-3xl font-bold text-gray-800 mb-1">{stats.highPoints}</p>
              <p className="text-sm text-gray-500 font-medium">Siswa Poin Tinggi ({'>'}20)</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              <h3 className="font-bold text-lg mb-4 text-gray-800">Status Perhatian Khusus</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-center justify-between">
                      <div>
                          <p className="text-sm font-medium text-orange-800 mb-1">Kasus Aktif / Pantauan</p>
                          <p className="text-2xl font-bold text-orange-900">{stats.activeCases}</p>
                      </div>
                      <div className="bg-white p-2 rounded-full shadow-sm"><ShieldAlert size={20} className="text-orange-500"/></div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-center justify-between">
                      <div>
                          <p className="text-sm font-medium text-yellow-800 mb-1">Absensi Tinggi ({'>'}5 Hari)</p>
                          <p className="text-2xl font-bold text-yellow-900">{stats.highAbsence}</p>
                      </div>
                      <div className="bg-white p-2 rounded-full shadow-sm"><User size={20} className="text-yellow-500"/></div>
                  </div>
              </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-lg mb-4 text-gray-800 flex items-center gap-2"><CheckCircle className="text-emerald-500" size={20}/> Kelengkapan Data</h3>
              <div className="flex flex-col items-center justify-center p-4">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path className="text-gray-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          <path className="text-emerald-500 transition-all duration-1000 ease-out" strokeWidth="3" strokeDasharray={`${stats.total > 0 ? (stats.completeProfiles/stats.total)*100 : 0}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                          <span className="text-2xl font-bold text-gray-800">{stats.completeProfiles}</span>
                          <span className="text-xs text-gray-500">dari {stats.total}</span>
                      </div>
                  </div>
                  <p className="text-sm text-center text-gray-600 mt-4">Siswa dengan seluruh 26 data terisi lengkap.</p>
              </div>
          </div>
      </div>

       <div className="bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl p-6 mt-6 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
              <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><Key size={20}/> Kunci Akses Portal Siswa</h3>
              <p className="text-indigo-100 text-sm max-w-xl">Bagikan ID Anda kepada siswa agar mereka dapat masuk ke Portal Siswa untuk memantau nilai dan memperbarui biodata secara mandiri menggunakan NISN dan PIN mereka.</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-indigo-100 text-xs font-medium uppercase tracking-wider">ID Guru (UID)</span>
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/30 cursor-pointer hover:bg-white/30 transition-colors" title="Klik dua kali untuk menyalin">
                  <code className="font-mono font-bold text-lg select-all">{user.uid}</code>
              </div>
          </div>
      </div>
    </div>
  );
};

const StudentManagement = ({ students, db, user, updatePublicMapping }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState('profil');
  const [cases, setCases] = useState([]); // Cases for selected student
  
  // Form States
  const [newStudentData, setNewStudentData] = useState({ Nama: '', NISN: '', Status: 'Wali Kelas' });
  const [editData, setEditData] = useState({});
  const [newCase, setNewCase] = useState({ title: '', description: '', status: 'Sedang Diproses', date: new Date().toISOString().split('T')[0] });
  const [caseReply, setCaseReply] = useState('');

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.Nama?.toLowerCase().includes(searchTerm.toLowerCase()) || s.NISN?.includes(searchTerm);
      const matchStatus = filterStatus === 'Semua' || s.Status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [students, searchTerm, filterStatus]);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await readCSVData(file);
      let addedCount = 0;
      for (const row of data) {
        if (row.Nama && row.NISN) {
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'students'), {
            ...row,
            pin: Math.floor(100000 + Math.random() * 900000).toString(),
            absensi: { S: 0, I: 0, A: 0 },
            poin: 0,
            karakter: { spiritual: 'B', sosial: 'B', kedisiplinan: 'B', tanggungjawab: 'B', catatan: '' }
          });
          addedCount++;
        }
      }
      setIsImportModalOpen(false);
      updatePublicMapping();
      alert(`Berhasil mengimpor ${addedCount} siswa.`);
    } catch (err) {
      console.error(err);
      alert("Gagal mengimpor data. Pastikan format CSV sesuai template.");
    }
  };

  const handleManualAdd = async () => {
      if(!newStudentData.Nama || !newStudentData.NISN) {
          alert("Nama dan NISN wajib diisi.");
          return;
      }
      try {
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'students'), {
            ...newStudentData,
            pin: Math.floor(100000 + Math.random() * 900000).toString(),
            absensi: { S: 0, I: 0, A: 0 },
            poin: 0,
            karakter: { spiritual: 'B', sosial: 'B', kedisiplinan: 'B', tanggungjawab: 'B', catatan: '' }
          });
          setIsAddModalOpen(false);
          setNewStudentData({ Nama: '', NISN: '', Status: 'Wali Kelas' });
          updatePublicMapping();
          alert("Siswa berhasil ditambahkan.");
      } catch (err) {
          console.error(err);
      }
  }

  const openDetail = (student) => {
    setSelectedStudent(student);
    setEditData({ ...student });
    setActiveDetailTab('profil');
    setIsDetailModalOpen(true);
    
    const casesQuery = query(collection(db, 'artifacts', appId, 'users', user.uid, 'cases'));
    onSnapshot(casesQuery, (snapshot) => {
        const c = [];
        snapshot.forEach(doc => {
            if(doc.data().studentId === student.id) c.push({id: doc.id, ...doc.data()});
        });
        setCases(c.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
  };

  const saveProfile = async () => {
    try {
      const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'students', selectedStudent.id);
      await updateDoc(ref, editData);
      setSelectedStudent({...selectedStudent, ...editData});
      updatePublicMapping();
      alert("Data berhasil disimpan");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan data");
    }
  };

  const handleAbsensiChange = (type, val) => {
      setEditData({
          ...editData,
          absensi: { ...editData.absensi, [type]: parseInt(val) || 0 }
      });
  };

  const handleKarakterChange = (field, val) => {
      setEditData({
          ...editData,
          karakter: { ...editData.karakter, [field]: val }
      });
  };

  const addCase = async () => {
      if(!newCase.title || !newCase.description) return;
      try {
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'cases'), {
              ...newCase,
              studentId: selectedStudent.id,
              date: new Date(newCase.date).getTime(),
              responses: []
          });
          setNewCase({ title: '', description: '', status: 'Sedang Diproses', date: new Date().toISOString().split('T')[0] });
          updatePublicMapping();
      } catch (err) {
          console.error(err);
      }
  };

  const replyToCase = async (caseId) => {
      if(!caseReply.trim()) return;
      try {
          const caseRef = doc(db, 'artifacts', appId, 'users', user.uid, 'cases', caseId);
          const targetCase = cases.find(c => c.id === caseId);
          await updateDoc(caseRef, {
              responses: [...(targetCase.responses || []), { sender: 'Guru', text: caseReply, date: Date.now() }]
          });
          setCaseReply('');
          updatePublicMapping();
      } catch(err) {
          console.error(err);
      }
  }

  const updateCaseStatus = async (caseId, newStatus) => {
      try {
          const caseRef = doc(db, 'artifacts', appId, 'users', user.uid, 'cases', caseId);
          await updateDoc(caseRef, { status: newStatus });
          updatePublicMapping();
      } catch (err) {
          console.error(err);
      }
  }

  const deleteStudent = async (id) => {
      const pinConfirm = window.prompt("Tindakan ini permanen. Ketik PIN siswa ini untuk menghapus:");
      if(pinConfirm !== selectedStudent.pin) {
          if(pinConfirm !== null) alert("PIN salah. Penghapusan dibatalkan.");
          return;
      }
      try {
          await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'students', id));
          setIsDetailModalOpen(false);
          updatePublicMapping();
      } catch (err) {
          console.error(err);
      }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Manajemen Data Siswa</h2>
            <p className="text-gray-500 text-sm">Kelola biodata, nilai karakter, dan catatan konseling.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari Nama atau NISN..." 
              className="input-field pl-10 w-full bg-white shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="input-field bg-white shadow-sm min-w-[140px]" 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
          >
              <option value="Semua">Semua Status</option>
              <option value="Wali Kelas">Siswa Wali Kelas</option>
              <option value="Bimbingan">Siswa Bimbingan</option>
          </select>
          <button onClick={() => setIsAddModalOpen(true)} className="btn-secondary flex items-center justify-center gap-2 whitespace-nowrap bg-white shadow-sm">
            <Plus size={18} /> Tambah
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap shadow-sm">
            <FileSpreadsheet size={18} /> Impor
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 text-sm">
                <th className="p-4 font-semibold rounded-tl-2xl">Nama Lengkap & NISN</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-center">Absensi (S / I / A)</th>
                <th className="p-4 font-semibold text-center">Poin</th>
                <th className="p-4 font-semibold text-right rounded-tr-2xl">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-gray-500 bg-gray-50/50">Tidak ada data siswa yang cocok.</td></tr>
              ) : filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onClick={() => openDetail(s)}>
                  <td className="p-4">
                      <p className="font-bold text-gray-800">{s.Nama}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{s.NISN}</p>
                  </td>
                  <td className="p-4">
                      <span className={`px-3 py-1 text-xs rounded-full font-medium ${s.Status === 'Wali Kelas' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {s.Status}
                      </span>
                  </td>
                  <td className="p-4">
                      <div className="flex justify-center items-center gap-2 text-sm">
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600" title="Sakit">{s.absensi?.S || 0}</span>
                          <span className="text-gray-300">/</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600" title="Izin">{s.absensi?.I || 0}</span>
                          <span className="text-gray-300">/</span>
                          <span className={`px-2 py-0.5 rounded font-medium ${s.absensi?.A > 3 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`} title="Alpa">{s.absensi?.A || 0}</span>
                      </div>
                  </td>
                  <td className="p-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                          s.poin > 20 ? 'bg-red-100 text-red-700' : 
                          s.poin > 10 ? 'bg-yellow-100 text-yellow-700' : 
                          'bg-emerald-100 text-emerald-700'}`}>
                          {s.poin || 0}
                      </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-indigo-600 hover:text-indigo-800 font-medium text-sm flex items-center justify-end gap-1 ml-auto group-hover:translate-x-1 transition-transform">
                        Kelola <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Impor Data Siswa">
        <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800">
                <p className="font-semibold mb-1">Gunakan Template CSV</p>
                <p>Unduh template, isi dengan data (pastikan kolom Nama dan NISN terisi), lalu simpan sebagai file CSV untuk diimpor kembali ke sini.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={generateCSVTemplate} className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3">
                    <Download size={18} /> Unduh Template CSV
                </button>
                <div className="flex-1 relative">
                    <input type="file" accept=".csv" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <button className="btn-primary w-full h-full flex items-center justify-center gap-2 py-3 shadow-md">
                        <Plus size={18} /> Pilih & Impor File CSV
                    </button>
                </div>
            </div>
        </div>
      </Modal>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Tambah Siswa Cepat">
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                  <input type="text" className="input-field w-full" value={newStudentData.Nama} onChange={e => setNewStudentData({...newStudentData, Nama: e.target.value})} placeholder="Contoh: Budi Santoso" />
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NISN <span className="text-red-500">*</span></label>
                  <input type="text" className="input-field w-full" value={newStudentData.NISN} onChange={e => setNewStudentData({...newStudentData, NISN: e.target.value})} placeholder="Contoh: 0012345678" />
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status Keanggotaan</label>
                  <select className="input-field w-full" value={newStudentData.Status} onChange={e => setNewStudentData({...newStudentData, Status: e.target.value})}>
                      <option value="Wali Kelas">Siswa Wali Kelas</option>
                      <option value="Bimbingan">Siswa Bimbingan</option>
                  </select>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                  <button onClick={handleManualAdd} className="btn-primary w-full sm:w-auto">Simpan Siswa</button>
              </div>
          </div>
      </Modal>

      {}
      {selectedStudent && (
          <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={`Kelola Data: ${selectedStudent.Nama}`} maxWidth="max-w-5xl">
              <div className="flex border-b border-gray-200 mb-6 bg-gray-50/50 rounded-t-xl overflow-x-auto">
                <button onClick={() => setActiveDetailTab('profil')} className={`px-6 py-4 font-semibold transition-colors whitespace-nowrap ${activeDetailTab === 'profil' ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-100'}`}>Profil Lengkap & Akses</button>
                <button onClick={() => setActiveDetailTab('akademik')} className={`px-6 py-4 font-semibold transition-colors whitespace-nowrap ${activeDetailTab === 'akademik' ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-100'}`}>Absensi & Karakter</button>
                <button onClick={() => setActiveDetailTab('kasus')} className={`px-6 py-4 font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${activeDetailTab === 'kasus' ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-100'}`}>Catatan Konseling {cases.filter(c=>c.status!=='Selesai').length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{cases.filter(c=>c.status!=='Selesai').length}</span>}</button>
              </div>

              {}
              {activeDetailTab === 'profil' && (
                  <div className="space-y-6">
                      <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                              <p className="text-sm font-medium text-indigo-800 mb-1 flex items-center gap-2"><Key size={16}/> PIN Akses Portal Siswa</p>
                              <p className="text-3xl font-mono font-bold tracking-[0.2em] text-indigo-900 bg-white px-4 py-1 rounded-lg border border-indigo-200 inline-block">{selectedStudent.pin}</p>
                              <p className="text-xs text-indigo-600 mt-2 max-w-sm">Berikan PIN ini dan ID Guru Anda agar siswa dapat login ke portal. Siswa dapat memperbarui data biodata ini secara mandiri (kecuali Nama & NISN).</p>
                          </div>
                          <button onClick={() => deleteStudent(selectedStudent.id)} className="text-red-600 hover:bg-red-100 bg-red-50 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold transition-colors shrink-0">
                              <Trash2 size={16}/> Hapus Data Siswa
                          </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6 bg-white p-2 h-[50vh] overflow-y-auto custom-scrollbar">
                          {DATA_COLUMNS.map(col => (
                              <div key={col} className="flex flex-col">
                                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">{col}</label>
                                  {col === 'Status' ? (
                                      <select className="input-field w-full bg-gray-50" value={editData[col] || ''} onChange={(e) => setEditData({...editData, [col]: e.target.value})}>
                                          <option value="Wali Kelas">Wali Kelas</option>
                                          <option value="Bimbingan">Bimbingan</option>
                                      </select>
                                  ) : col === 'Nama' || col === 'NISN' ? (
                                      <input type="text" className="input-field w-full font-medium" value={editData[col] || ''} onChange={(e) => setEditData({...editData, [col]: e.target.value})} />
                                  ) : (
                                      <input type="text" className="input-field w-full bg-gray-50" value={editData[col] || ''} onChange={(e) => setEditData({...editData, [col]: e.target.value})} />
                                  )}
                              </div>
                          ))}
                      </div>
                      <div className="flex justify-end pt-4 border-t sticky bottom-0 bg-white pb-2">
                          <button onClick={saveProfile} className="btn-primary shadow-lg px-8">Simpan Perubahan Profil</button>
                      </div>
                  </div>
              )}

              {}
              {activeDetailTab === 'akademik' && (
                   <div className="space-y-8 min-h-[50vh]">
                       <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                           <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2"><User size={20} className="text-blue-500"/> Rekap Absensi & Pelanggaran</h3>
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-600 mb-2">Sakit (Hari)</label>
                                    <input type="number" min="0" className="input-field w-full text-lg text-center bg-gray-50" value={editData.absensi?.S || 0} onChange={(e) => handleAbsensiChange('S', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-600 mb-2">Izin (Hari)</label>
                                    <input type="number" min="0" className="input-field w-full text-lg text-center bg-gray-50" value={editData.absensi?.I || 0} onChange={(e) => handleAbsensiChange('I', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-600 mb-2">Alpa (Hari)</label>
                                    <input type="number" min="0" className={`input-field w-full text-lg text-center font-bold ${editData.absensi?.A > 3 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50'}`} value={editData.absensi?.A || 0} onChange={(e) => handleAbsensiChange('A', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-red-600 mb-2">Total Poin Hukuman</label>
                                    <input type="number" min="0" className="input-field w-full text-xl text-center border-red-300 bg-red-50 text-red-700 font-bold shadow-inner" value={editData.poin || 0} onChange={(e) => setEditData({...editData, poin: parseInt(e.target.value) || 0})} />
                                </div>
                           </div>
                       </div>

                       <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                           <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2"><CheckCircle size={20} className="text-emerald-500"/> Penilaian Karakter</h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               {['Spiritual', 'Sosial', 'Kedisiplinan', 'Tanggungjawab'].map(k => {
                                   const key = k.toLowerCase();
                                   return (
                                   <div key={k} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100 hover:border-emerald-200 transition-colors">
                                       <span className="font-semibold text-gray-700">{k}</span>
                                       <select className="input-field py-1.5 font-bold text-center min-w-[80px]" value={editData.karakter?.[key] || 'B'} onChange={(e) => handleKarakterChange(key, e.target.value)}>
                                           <option value="A" className="text-emerald-600">A - Sangat Baik</option>
                                           <option value="B" className="text-blue-600">B - Baik</option>
                                           <option value="C" className="text-yellow-600">C - Cukup</option>
                                           <option value="D" className="text-red-600">D - Kurang</option>
                                       </select>
                                   </div>
                               )})}
                               <div className="col-span-1 md:col-span-2 mt-2">
                                   <label className="block text-sm font-semibold text-gray-700 mb-2">Catatan Khusus Wali Kelas / Bimbingan</label>
                                   <textarea className="input-field w-full bg-gray-50 focus:bg-white" rows="3" value={editData.karakter?.catatan || ''} onChange={(e) => handleKarakterChange('catatan', e.target.value)} placeholder="Tuliskan apresiasi, saran pengembangan, atau evaluasi karakter siswa..."></textarea>
                               </div>
                           </div>
                       </div>

                       <div className="flex justify-end pt-4 sticky bottom-0 bg-white pb-2">
                          <button onClick={saveProfile} className="btn-primary shadow-lg px-8">Simpan Data Akademik</button>
                      </div>
                   </div>
              )}

              {}
              {activeDetailTab === 'kasus' && (
                  <div className="flex flex-col h-[65vh]">
                      <div className="bg-white p-5 rounded-2xl border border-gray-200 mb-4 shadow-sm shrink-0">
                          <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Plus size={18}/> Tambah Catatan / Kasus Baru</h4>
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                              <div className="md:col-span-4">
                                  <input type="text" placeholder="Judul Kasus (ex: Terlambat, Merokok, Berprestasi)" className="input-field w-full text-sm font-medium bg-gray-50" value={newCase.title} onChange={e => setNewCase({...newCase, title: e.target.value})} />
                              </div>
                              <div className="md:col-span-3">
                                  <select className="input-field w-full text-sm font-medium bg-gray-50" value={newCase.status} onChange={e => setNewCase({...newCase, status: e.target.value})}>
                                      <option value="Sedang Diproses">Sedang Diproses</option>
                                      <option value="Dalam Pantauan">Dalam Pantauan</option>
                                      <option value="Selesai">Selesai / Ditutup</option>
                                  </select>
                              </div>
                              <div className="md:col-span-3">
                                 <input type="date" className="input-field w-full text-sm bg-gray-50" value={newCase.date} onChange={e => setNewCase({...newCase, date: e.target.value})} />
                              </div>
                              <div className="md:col-span-2">
                                  <button onClick={addCase} className="btn-primary w-full text-sm py-2 h-full shadow-sm">Posting</button>
                              </div>
                              <div className="md:col-span-12 mt-1">
                                  <input type="text" placeholder="Jelaskan detail kronologi atau catatan konseling..." className="input-field w-full text-sm bg-gray-50" value={newCase.description} onChange={e => setNewCase({...newCase, description: e.target.value})} />
                              </div>
                          </div>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-4">
                          {cases.length === 0 && <div className="text-center py-10 text-gray-400">Belum ada rekam jejak konseling atau kasus untuk siswa ini.</div>}
                          {cases.map(c => (
                              <div key={c.id} className="border border-gray-200 rounded-2xl p-5 shadow-sm bg-white hover:border-indigo-200 transition-colors">
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 border-b border-gray-100 pb-3">
                                    <div>
                                        <h4 className="font-bold text-gray-800 text-lg">{c.title}</h4>
                                        <p className="text-xs font-medium text-gray-500 mt-1">Dibuat pada: {new Date(c.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                    </div>
                                    <select 
                                        className={`text-sm font-bold px-3 py-1.5 rounded-full border-0 shadow-sm cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 ${c.status === 'Selesai' ? 'bg-emerald-100 text-emerald-800' : c.status === 'Dalam Pantauan' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}
                                        value={c.status}
                                        onChange={(e) => updateCaseStatus(c.id, e.target.value)}
                                    >
                                        <option value="Sedang Diproses">Status: Sedang Diproses</option>
                                        <option value="Dalam Pantauan">Status: Dalam Pantauan</option>
                                        <option value="Selesai">Status: Selesai</option>
                                    </select>
                                </div>
                                <div className="text-sm text-gray-700 mb-5 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Deskripsi Kasus:</span>
                                    {c.description}
                                </div>
                                
                                <div className="space-y-3 pl-4 border-l-2 border-indigo-100">
                                    {c.responses?.map((r, i) => (
                                        <div key={i} className={`text-sm p-3 rounded-xl max-w-[85%] ${r.sender === 'Guru' ? 'bg-indigo-50 text-indigo-900 ml-auto border border-indigo-100' : 'bg-gray-100 text-gray-800 border border-gray-200'}`}>
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="font-bold text-xs opacity-70">{r.sender}</span>
                                                <span className="text-[10px] opacity-50">{new Date(r.date).toLocaleDateString()} {new Date(r.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <p>{r.text}</p>
                                        </div>
                                    ))}
                                    <div className="flex gap-2 mt-4 pt-2">
                                        <input type="text" placeholder="Balas tanggapan siswa / tambah catatan diskusi..." className="input-field flex-1 text-sm bg-gray-50 shadow-inner" onKeyDown={(e) => {
                                            if(e.key === 'Enter') { setCaseReply(e.target.value); replyToCase(c.id); e.target.value = ''; }
                                        }} onChange={(e) => setCaseReply(e.target.value)}/>
                                        <button onClick={() => replyToCase(c.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl shadow-sm transition-colors"><Send size={18}/></button>
                                    </div>
                                </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </Modal>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('login'); 
  const [students, setStudents] = useState([]);
  const [cases, setCases] = useState([]);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [portalConfig, setPortalConfig] = useState({ guruId: '', nisn: '', pin: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile

  // Email/Password State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    // Inject custom scrollbar styles dynamically
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #f8fafc; color: #0f172a; }
      .input-field { border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 0.625rem 1rem; outline: none; transition: all 0.2s ease; font-family: inherit; }
      .input-field:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); background-color: #fff; }
      .btn-primary { background-color: #4f46e5; color: white; padding: 0.625rem 1.25rem; border-radius: 0.75rem; font-weight: 600; transition: all 0.2s ease; border: 1px solid transparent; }
      .btn-primary:hover { background-color: #4338ca; transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); }
      .btn-primary:active { transform: translateY(0); }
      .btn-secondary { background-color: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 0.625rem 1.25rem; border-radius: 0.75rem; font-weight: 600; transition: all 0.2s ease; }
      .btn-secondary:hover { background-color: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
      
      /* Custom Scrollbar */
      .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    `;
    document.head.appendChild(style);

    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token).catch(console.error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && viewMode === 'login') {
        setViewMode('guru');
      }
      setLoading(false);
    });

    return () => {
        unsubscribe();
        document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    if (!user || viewMode !== 'guru') return;

    const studentQuery = query(collection(db, 'artifacts', appId, 'users', user.uid, 'students'));
    const unsubscribeStudents = onSnapshot(studentQuery, (snapshot) => {
      const s = [];
      snapshot.forEach((doc) => s.push({ id: doc.id, ...doc.data() }));
      setStudents(s);
    }, (error) => {
        console.error("Firestore error:", error);
    });

    const casesQuery = query(collection(db, 'artifacts', appId, 'users', user.uid, 'cases'));
    const unsubscribeCases = onSnapshot(casesQuery, (snapshot) => {
       const c = [];
       snapshot.forEach(doc => c.push({id: doc.id, ...doc.data()}));
       setCases(c);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeCases();
    };
  }, [user, viewMode]);

  const updatePublicMapping = useCallback(async () => {
      if(!user) return;
      try {
          const mapping = {};
          students.forEach(s => mapping[s.NISN] = s.id);
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teacher_students', user.uid), { students: mapping });

          for(const s of students) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students_data', s.id), s);
          }

          for(const c of cases) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases_data', c.id), c);
          }
      } catch (err) {
          console.error("Error syncing to public:", err);
      }
  }, [students, cases, user]);

  useEffect(() => {
      if(students.length > 0 || cases.length > 0) {
          const timer = setTimeout(() => { updatePublicMapping(); }, 2000);
          return () => clearTimeout(timer);
      }
  }, [students, cases, updatePublicMapping]);

  // Idle Logout Logic
  useEffect(() => {
      if (viewMode !== 'guru' && viewMode !== 'portal') return;
      
      let timeoutId;
      const resetTimer = () => {
          clearTimeout(timeoutId);
          // 15 minutes = 900000 ms
          timeoutId = setTimeout(() => {
              if(viewMode === 'guru') {
                  signOut(auth);
                  alert("Sesi Anda berakhir karena tidak ada aktivitas selama 15 menit. Silakan login kembali.");
              } else if (viewMode === 'portal') {
                  setViewMode('portal-login');
                  setPortalConfig({guruId:'', nisn:'', pin:''});
                  alert("Sesi portal berakhir. Silakan login kembali.");
              }
          }, 900000);
      };

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      events.forEach(e => document.addEventListener(e, resetTimer));
      resetTimer();

      return () => {
          clearTimeout(timeoutId);
          events.forEach(e => document.removeEventListener(e, resetTimer));
      };
  }, [viewMode]);

  // Handle Email/Password Login & Register
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Email dan password harus diisi.');
      return;
    }
    setIsAuthLoading(true);
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Jika berhasil, onAuthStateChanged akan memindahkannya ke dashboard
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
          setAuthError('Email atau password salah.');
      } else if (error.code === 'auth/email-already-in-use') {
          setAuthError('Email ini sudah terdaftar. Silakan login.');
      } else if (error.code === 'auth/weak-password') {
          setAuthError('Password terlalu lemah (minimal 6 karakter).');
      } else {
          setAuthError(`Terjadi kesalahan: ${error.message}`);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePortalLogin = async () => {
      if(!portalConfig.guruId || !portalConfig.nisn || !portalConfig.pin) {
          alert("Harap isi semua kolom.");
          return;
      }
      
      setLoading(true);
      try {
          // Verify PIN logic
          const publicMappingRef = doc(db, 'artifacts', appId, 'public', 'data', 'teacher_students', portalConfig.guruId);
          
          // Use onSnapshot for a single check to bypass getDoc restrictions in MVP env
          const unsubscribe = onSnapshot(publicMappingRef, (docSnap) => {
              unsubscribe(); // Stop listening immediately
              if (docSnap.exists()) {
                  const mapping = docSnap.data().students || {};
                  const studentId = mapping[portalConfig.nisn];
                  
                  if(studentId) {
                      const studentRef = doc(db, 'artifacts', appId, 'public', 'data', 'students_data', studentId);
                      const unsubStudent = onSnapshot(studentRef, (sDoc) => {
                          unsubStudent();
                          if(sDoc.exists() && sDoc.data().pin === portalConfig.pin) {
                              setViewMode('portal');
                              setLoading(false);
                          } else {
                              alert("PIN Akses salah.");
                              setLoading(false);
                          }
                      });
                  } else {
                      alert("NISN tidak terdaftar pada ID Guru ini.");
                      setLoading(false);
                  }
              } else {
                  alert("ID Guru tidak valid.");
                  setLoading(false);
              }
          });
      } catch (err) {
          console.error(err);
          alert("Terjadi kesalahan. Coba lagi.");
          setLoading(false);
      }
  };

  if (loading) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 border-t-transparent mb-4"></div><p className="text-gray-500 font-medium">Memuat sistem...</p></div>;

  if (viewMode === 'login' || viewMode === 'portal-login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-white to-blue-50 p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-indigo-200/50 w-full max-w-md overflow-hidden border border-white">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-10 text-center text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-blue-400 opacity-20 rounded-full blur-2xl"></div>
                
                <div className="bg-white/20 p-4 rounded-2xl w-20 h-20 mx-auto mb-6 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                    <BookOpen className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-3xl font-extrabold mb-2 tracking-tight">EduWali <span className="text-indigo-200">Pro</span></h1>
                <p className="text-indigo-100 font-medium opacity-90 text-sm">Digitalisasi Wali Kelas & Bimbingan</p>
            </div>
            
            <div className="flex border-b border-gray-100 bg-gray-50/50">
                <button onClick={() => setViewMode('login')} className={`flex-1 py-4 font-bold transition-all text-sm ${viewMode === 'login' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500 hover:text-gray-800'}`}>Akses Guru</button>
                <button onClick={() => setViewMode('portal-login')} className={`flex-1 py-4 font-bold transition-all text-sm ${viewMode === 'portal-login' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500 hover:text-gray-800'}`}>Portal Siswa</button>
            </div>

            <div className="p-8">
                {viewMode === 'login' ? (
                    <div className="space-y-4">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">
                                {isRegistering ? 'Daftar Akun Baru' : 'Selamat Datang Kembali'}
                            </h2>
                            <p className="text-sm text-gray-500">
                                {isRegistering ? 'Buat akun untuk mengelola kelas Anda.' : 'Masuk untuk mengelola siswa bimbingan Anda.'}
                            </p>
                        </div>

                        {authError && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-start gap-2">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{authError}</span>
                            </div>
                        )}

                        <form onSubmit={handleEmailAuth} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                                <input 
                                    type="email" 
                                    className="input-field w-full bg-gray-50" 
                                    placeholder="nama@sekolah.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                                <input 
                                    type="password" 
                                    className="input-field w-full bg-gray-50" 
                                    placeholder="Minimal 6 karakter"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={isAuthLoading}
                                className="btn-primary w-full py-3.5 mt-2 text-lg shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isAuthLoading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>}
                                {isRegistering ? 'Daftar Sekarang' : 'Masuk Dashboard'}
                            </button>
                        </form>

                        <div className="text-center mt-6">
                            <button 
                                type="button" 
                                onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
                                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                                {isRegistering ? 'Sudah punya akun? Masuk di sini' : 'Belum punya akun? Daftar di sini'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                         <div className="text-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Login Portal Siswa</h2>
                            <p className="text-sm text-gray-500">Gunakan ID Guru, NISN, dan PIN yang diberikan oleh wali kelas Anda.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">ID Guru (UID)</label>
                            <input type="text" className="input-field w-full bg-gray-50" placeholder="Minta ID ini pada guru Anda" value={portalConfig.guruId} onChange={e => setPortalConfig({...portalConfig, guruId: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Nomor Induk Siswa Nasional (NISN)</label>
                            <input type="text" className="input-field w-full bg-gray-50" placeholder="Masukkan NISN valid" value={portalConfig.nisn} onChange={e => setPortalConfig({...portalConfig, nisn: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">PIN Akses (6 Digit)</label>
                            <input type="password" maxLength="6" className="input-field w-full text-center tracking-[0.5em] text-2xl font-mono bg-gray-50" placeholder="------" value={portalConfig.pin} onChange={e => setPortalConfig({...portalConfig, pin: e.target.value})} />
                        </div>
                        <button onClick={handlePortalLogin} className="btn-primary w-full py-3.5 mt-6 text-lg shadow-lg shadow-indigo-200">Masuk Portal</button>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'portal') {
      return <PortalSiswa guruId={portalConfig.guruId} studentNisn={portalConfig.nisn} onLogout={() => { setViewMode('portal-login'); setPortalConfig({guruId:'', nisn:'', pin:''}) }} />;
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
          <div className="fixed inset-0 bg-gray-800/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col shrink-0 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} shadow-2xl md:shadow-none`}>
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-indigo-600">
                <div className="bg-indigo-50 p-2 rounded-xl"><BookOpen size={24} /></div>
                <span className="text-2xl font-extrabold tracking-tight">EduWali<span className="text-gray-800">Pro</span></span>
            </div>
            <button className="md:hidden text-gray-500" onClick={() => setIsSidebarOpen(false)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
            <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">Menu Utama</p>
            <button onClick={() => {setActiveMenu('dashboard'); setIsSidebarOpen(false)}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium ${activeMenu === 'dashboard' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'}`}>
                <Users size={20} className={activeMenu === 'dashboard' ? 'text-white' : 'text-gray-400'}/> Dashboard
            </button>
            <button onClick={() => {setActiveMenu('students'); setIsSidebarOpen(false)}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium ${activeMenu === 'students' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'}`}>
                <FileSpreadsheet size={20} className={activeMenu === 'students' ? 'text-white' : 'text-gray-400'}/> Manajemen Siswa
            </button>
        </nav>
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl mb-3 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                    {user?.email?.charAt(0).toUpperCase() || 'G'}
                </div>
                <div className="truncate flex-1">
                    <p className="font-bold text-sm text-gray-800 truncate">Guru / Wali</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
            </div>
            <button onClick={() => signOut(auth)} className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 py-3 rounded-xl transition-colors font-bold text-sm border border-transparent hover:border-red-100">
                <LogOut size={18} /> Keluar Sistem
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
                <BookOpen size={20} /> EduWali Pro
            </div>
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-gray-100 rounded-lg text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
            {activeMenu === 'dashboard' && <Dashboard user={user} students={students} cases={cases} />}
            {activeMenu === 'students' && <StudentManagement db={db} user={user} students={students} updatePublicMapping={updatePublicMapping} />}
        </div>
      </main>
    </div>
  );
}
