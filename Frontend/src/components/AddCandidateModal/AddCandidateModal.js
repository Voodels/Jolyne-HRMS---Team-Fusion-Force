
import { useState, useEffect } from 'react';
import Loader from '../Loader/Loader';
import './AddCandidateModal.css';
import { getJobTitles } from '../../api/jobApi';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const INITIAL_FORM = {
  name: '',
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  department: '',
  resume: null,
  // keep other fields if needed but initialize minimally
  resumeUrl: '',
  activeJob: '',
  currentStage: 'APPLIED'
};

function AddCandidateModal({ isOpen, onClose, onAdd, editData }) {

  const [form, setForm] = useState(INITIAL_FORM);

  const [resumeUrl, setResumeUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobOptions, setJobOptions] = useState([]);

  const isEdit = !!editData;

  useEffect(() => {
    const loadJobOptions = async () => {
      try {
        const titles = await getJobTitles();
        setJobOptions(titles);
      } catch (err) {
        console.error('Failed to load job options', err);
      }
    };

    loadJobOptions();
  }, []);

  // ---------------- PREFILL ----------------
  useEffect(() => {
  if (editData) {
    setForm(prev => ({
      ...prev, // 🔥 keeps all existing fields intact

      name: `${editData.firstName || ''} ${editData.lastName || ''}`.trim(),
      email: editData.email || '',
      jobTitle: editData.department || '',

      // 👇 map additional fields safely
      phone: editData.phone || prev.phone,
      location: editData.location || prev.location,
      yearsOfExperience: editData.yearsOfExperience || prev.yearsOfExperience,
      department: editData.department || prev.department,
      currentCompany: editData.currentCompany || prev.currentCompany,
      currentCtc: editData.currentCtc || prev.currentCtc,
      education: editData.education || prev.education,
      currentStage: editData.currentStage || prev.currentStage,

      skills: editData.skills || prev.skills,
      resume: null, // keep as is
    }));

    setResumeUrl(editData.resumeUrl || '');
  }
}, [editData]);

  if (!isOpen) return null;

  // ---------------- INPUT ----------------
  const handleChange = async (e) => {
    const { name, value, files } = e.target;

    if (name === 'resume') {
      const file = files[0];
      setForm({ ...form, resume: file });

      // 🔥 Upload + Parse both
      await handleFileUpload(file);
      await parseResume(file);

    } else {
      setForm({ ...form, [name]: value });
    }
  };

  // ---------------- CLOUDINARY UPLOAD ----------------
  const handleFileUpload = async (file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);

      const res = await fetch(`${BASE_URL}/candidates/upload-resume`, {
        method: "POST",
        body: formData,
      });

      const url = await res.text();

      console.log("Cloudinary URL:", url);
      setResumeUrl(url);

    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ---------------- BACKEND PARSE (AFFINDA PROXY) ----------------
const parseResume = async (file) => {
  try {
    setParsing(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${BASE_URL}/candidates/parse-resume`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    console.log("Affinda Response:", data);

    const parsed = data?.data || {};

    // ================= BASIC =================
    const name =
  parsed?.fullName ||
  parsed?.name?.raw ||
  `${parsed?.firstName || ""} ${parsed?.lastName || ""}`.trim();

  const firstName = parsed?.firstName || "";
const middleName = parsed?.middleName || "";
const lastName = parsed?.lastName || "";

    const email =
      parsed?.email ||
      (Array.isArray(parsed?.emails) ? parsed.emails[0] : "") ||
      "";

    const phone =
      parsed?.phone ||
      (Array.isArray(parsed?.phoneNumbers) ? parsed.phoneNumbers[0] : "") ||
      "";

    const alternatePhone =
      Array.isArray(parsed?.phoneNumbers) && parsed.phoneNumbers.length > 1
        ? parsed.phoneNumbers[1]
        : "";

    const dateOfBirth = parsed?.dateOfBirth || "";
    const gender = parsed?.gender || "";

    // ================= LOCATION =================
    const addressFull = parsed?.addressFull || "";
    const city = parsed?.city || "";
    const state = parsed?.state || "";
    const country = parsed?.country || "";
    const pincode = parsed?.pincode || "";

    const location =
      city || state || country || addressFull || "";

    // ================= LINKS =================
    const linkedinUrl = parsed?.linkedinUrl || "";
    const githubUrl = parsed?.githubUrl || "";
    const portfolioUrl = parsed?.portfolioUrl || "";
    const websiteUrl = parsed?.websiteUrl || "";
    const otherLinks = parsed?.otherLinks || [];

    // ================= SUMMARY =================
    const summaryText = parsed?.summaryText || "";
    const careerObjective = parsed?.careerObjective || "";

    // ================= JOB =================
    const jobTitle =
      parsed?.currentJobTitle ||
      (parsed?.experience?.[0]?.jobTitle) ||
      "";

    const currentCompany =
      parsed?.currentCompany ||
      (parsed?.experience?.[0]?.companyName) ||
      "";

    const domain = parsed?.domain || "";
    const activeJob = parsed?.activeJob || "";

    // ================= EXPERIENCE =================
    const totalExperienceYears = parsed?.totalExperienceYears || 0;

    // ================= EDUCATION =================
    const highestEducation =
      parsed?.highestEducation ||
      (parsed?.education?.[0]?.degree + " " +
        (parsed?.education?.[0]?.fieldOfStudy || "")) ||
      "";

    // ================= SKILLS =================
    const skillsArray = Array.isArray(parsed?.skills)
      ? parsed.skills.filter(s => s && (s.skillName || s.name))
      : [];

    const skills = skillsArray
      .map(s => s.skillName || s.name)
      .join(", ");

    const primarySkill = parsed?.primarySkill || skillsArray[0]?.skillName || "";

    // ================= ARRAYS (RAW JSON) =================
    const educationDetails = parsed?.education || [];
    const experienceDetails = parsed?.experience || [];
    const projects = parsed?.projects || [];
    const skillsDetailed = parsed?.skills || [];
    const achievements = parsed?.achievements || [];
    const certifications = parsed?.certifications || [];
    const positions = parsed?.positions || [];
    const codingProfiles = parsed?.codingProfiles || [];
    const languages = parsed?.languages || [];
    const publications = parsed?.publications || [];
    const activities = parsed?.activities || [];
    const sectionName = parsed?.sectionName || [];
    const sectionData = parsed?.sectionData || [];

    // ================= DEFAULT =================
    const currentStage = "APPLIED";

    // ================= UPDATE FORM =================
    // Only overwrite fields if they are empty (preserve user-entered data)
    setForm(prev => ({
      ...prev,

      // Only update name fields if user hasn't entered them
      name: prev.name || name,
      firstName: prev.firstName || firstName,
      middleName: prev.middleName || middleName,
      lastName: prev.lastName || lastName,

      email: prev.email || email,
      phone: prev.phone || phone,
      alternatePhone: prev.alternatePhone || alternatePhone,
      dateOfBirth: prev.dateOfBirth || dateOfBirth,
      gender: prev.gender || gender,

      addressFull: prev.addressFull || addressFull,
      city: prev.city || city,
      state: prev.state || state,
      country: prev.country || country,
      pincode: prev.pincode || pincode,
      location: prev.location || location,

      linkedinUrl: prev.linkedinUrl || linkedinUrl,
      githubUrl: prev.githubUrl || githubUrl,
      portfolioUrl: prev.portfolioUrl || portfolioUrl,
      websiteUrl: prev.websiteUrl || websiteUrl,
      otherLinks: prev.otherLinks?.length > 0 ? prev.otherLinks : otherLinks,

      summaryText: prev.summaryText || summaryText,
      careerObjective: prev.careerObjective || careerObjective,

      totalExperienceYears: prev.totalExperienceYears || totalExperienceYears,
      yearsOfExperience: prev.yearsOfExperience || totalExperienceYears,

      currentJobTitle: prev.currentJobTitle || jobTitle,
      currentCompany: prev.currentCompany || currentCompany,
      activeJob: prev.activeJob || activeJob,
      domain: prev.domain || domain,

      highestEducation: prev.highestEducation || highestEducation,
      primarySkill: prev.primarySkill || primarySkill,

      // Array fields - merge if empty
      educationDetails: prev.educationDetails?.length > 0 ? prev.educationDetails : educationDetails,
      experienceDetails: prev.experienceDetails?.length > 0 ? prev.experienceDetails : experienceDetails,
      projects: prev.projects?.length > 0 ? prev.projects : projects,
      skillsDetailed: prev.skillsDetailed?.length > 0 ? prev.skillsDetailed : skillsDetailed,
      achievements: prev.achievements?.length > 0 ? prev.achievements : achievements,
      certifications: prev.certifications?.length > 0 ? prev.certifications : certifications,
      positions: prev.positions?.length > 0 ? prev.positions : positions,
      codingProfiles: prev.codingProfiles?.length > 0 ? prev.codingProfiles : codingProfiles,
      languages: prev.languages?.length > 0 ? prev.languages : languages,
      publications: prev.publications?.length > 0 ? prev.publications : publications,
      activities: prev.activities?.length > 0 ? prev.activities : activities,
      sectionName: prev.sectionName?.length > 0 ? prev.sectionName : sectionName,
      sectionData: prev.sectionData?.length > 0 ? prev.sectionData : sectionData,

      // UI compatibility - merge skills
      skills: prev.skills || skills,
      department: prev.department || jobTitle,

      currentStage: prev.currentStage || currentStage
    }));

  } catch (err) {
    console.error("Parsing failed:", err);
  } finally {
    setParsing(false);
  }
};

  // ---------------- NAME SPLIT ----------------

  // ---------------- SUBMIT ----------------
const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    setLoading(true);

    // Send parsed candidate fields to backend so they are persisted
    const { resume, ...payload } = form;
    payload.resumeUrl = resumeUrl;
    payload.currentStage = payload.currentStage || "APPLIED";

    let url = `${BASE_URL}/candidates`;
    let method = "POST";

    if (isEdit) {
      url = `${BASE_URL}/candidates/${editData.id}`;
      method = "PUT";
    }

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Save failed");

    onAdd();
    onClose();

    // ✅ Reset to initial minimal form
    setForm(INITIAL_FORM);
    setResumeUrl("");

  } catch (err) {
    console.error(err);
    alert("Error saving candidate");
  } finally {
    setLoading(false);
  }
};

  // ---------------- UI ----------------
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{isEdit ? 'Edit Candidate' : 'Add Candidate'}</h3>

        <form onSubmit={handleSubmit} className="modal-form">

          <input
            type="text"
            name="name"
            placeholder="Full Name"
            required
            value={form.name}
            onChange={handleChange}
          />

          <input
            type="email"
            name="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={handleChange}
          />

          {jobOptions.length > 0 ? (
            <select
              name="department"
              value={form.department}
              onChange={handleChange}
              required
            >
              <option value="">Select Job Role</option>
              {jobOptions.map((title) => (
                <option key={title} value={title}>{title}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              name="department"
              placeholder="Job Role"
              value={form.department}
              onChange={handleChange}
              required
            />
          )}

          {/* <input
            type="text"
            name="skills"
            placeholder="Skills"
            value={form.skills}
            onChange={handleChange}
          /> */}

          {/* FILE */}
          <input
            type="file"
            name="resume"
            accept=".pdf"
            onChange={handleChange}
          />

          {/* STATUS */}
          {uploading && <Loader label="Uploading resume..." size="sm" inline />}
          {parsing && <Loader label="Parsing resume..." size="sm" inline />}
          {loading && !uploading && !parsing && (
            <Loader label="Saving candidate..." size="sm" inline />
          )}

          {/* PREVIEW LINK */}
          {resumeUrl && (
            <a href={resumeUrl} target="_blank" rel="noreferrer">
              View Resume
            </a>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>

            <button 
              type="submit" 
              className="btn-submit" 
              disabled={loading || uploading || parsing}
            >
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Add'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default AddCandidateModal;