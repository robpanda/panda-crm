import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactsApi, accountsApi } from '../services/api';
import { useRingCentral } from '../context/RingCentralContext';
import {
  Users, ArrowLeft, Phone, Mail, Building2, Edit, Save, X,
  MapPin, User, Clock, MessageSquare, PhoneOff, MailX, FileText
} from 'lucide-react';

const US_STATES = [
  { value: 'MD', label: 'Maryland' },
  { value: 'VA', label: 'Virginia' },
  { value: 'DC', label: 'Washington DC' },
  { value: 'DE', label: 'Delaware' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'FL', label: 'Florida' },
];

const CONTACT_METHODS = [
  { value: 'Phone', label: 'Phone' },
  { value: 'Email', label: 'Email' },
  { value: 'SMS', label: 'SMS/Text' },
  { value: 'Any', label: 'Any' },
];

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clickToCall } = useRingCentral();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => contactsApi.getContact(id),
    enabled: !!id,
    onSuccess: (data) => {
      if (!isEditing) {
        setFormData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          mobilePhone: data.mobilePhone || '',
          smsNumber: data.smsNumber || '',
          title: data.title || '',
          department: data.department || '',
          mailingStreet: data.mailingStreet || '',
          mailingCity: data.mailingCity || '',
          mailingState: data.mailingState || '',
          mailingPostalCode: data.mailingPostalCode || '',
          preferredContactMethod: data.preferredContactMethod || '',
          smsOptOut: data.smsOptOut || false,
          emailOptOut: data.emailOptOut || false,
          doNotCall: data.doNotCall || false,
          isPrimary: data.isPrimary || false,
          accountId: data.accountId || '',
        });
      }
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'list'],
    queryFn: () => accountsApi.getAccounts({ limit: 500 }),
    select: (data) => data.data || data,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => contactsApi.updateContact(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contact', id]);
      queryClient.invalidateQueries(['contacts']);
      setIsEditing(false);
    },
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = () => {
    const cleanedData = { ...formData };
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === '' && typeof cleanedData[key] === 'string') {
        cleanedData[key] = null;
      }
    });
    updateMutation.mutate(cleanedData);
  };

  const handleCancel = () => {
    setFormData({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      mobilePhone: contact.mobilePhone || '',
      smsNumber: contact.smsNumber || '',
      title: contact.title || '',
      department: contact.department || '',
      mailingStreet: contact.mailingStreet || '',
      mailingCity: contact.mailingCity || '',
      mailingState: contact.mailingState || '',
      mailingPostalCode: contact.mailingPostalCode || '',
      preferredContactMethod: contact.preferredContactMethod || '',
      smsOptOut: contact.smsOptOut || false,
      emailOptOut: contact.emailOptOut || false,
      doNotCall: contact.doNotCall || false,
      isPrimary: contact.isPrimary || false,
      accountId: contact.accountId || '',
    });
    setIsEditing(false);
  };

  const startEditing = () => {
    setFormData({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      mobilePhone: contact.mobilePhone || '',
      smsNumber: contact.smsNumber || '',
      title: contact.title || '',
      department: contact.department || '',
      mailingStreet: contact.mailingStreet || '',
      mailingCity: contact.mailingCity || '',
      mailingState: contact.mailingState || '',
      mailingPostalCode: contact.mailingPostalCode || '',
      preferredContactMethod: contact.preferredContactMethod || '',
      smsOptOut: contact.smsOptOut || false,
      emailOptOut: contact.emailOptOut || false,
      doNotCall: contact.doNotCall || false,
      isPrimary: contact.isPrimary || false,
      accountId: contact.accountId || '',
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Contact not found</p>
        <button onClick={() => navigate(-1)} className="text-panda-primary hover:underline mt-2 inline-block">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        {!isEditing ? (
          <button
            onClick={startEditing}
            className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:opacity-90"
          >
            <Edit className="w-4 h-4" />
            <span>Edit Contact</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCancel}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-xl font-medium">
                {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {contact.firstName} {contact.lastName}
              </h1>
              {contact.title && <p className="text-gray-500">{contact.title}</p>}
              <div className="flex items-center space-x-4 mt-2">
                {contact.phone && (
                  <button
                    onClick={() => clickToCall(contact.phone)}
                    className="flex items-center text-sm text-panda-primary hover:underline cursor-pointer"
                  >
                    <Phone className="w-4 h-4 mr-1" />
                    {contact.phone}
                  </button>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Mail className="w-4 h-4 mr-1" />
                    {contact.email}
                  </a>
                )}
              </div>
              {contact.account && (
                <Link to={`/accounts/${contact.account.id}`} className="flex items-center mt-2 text-sm text-gray-500 hover:text-panda-primary">
                  <Building2 className="w-4 h-4 mr-1" />
                  {contact.account.name}
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {contact.isPrimary && (
              <span className="badge badge-success">Primary Contact</span>
            )}
            {contact.doNotCall && (
              <span className="badge badge-warning flex items-center">
                <PhoneOff className="w-3 h-3 mr-1" />
                DNC
              </span>
            )}
            {contact.smsOptOut && (
              <span className="badge badge-gray flex items-center">
                <MessageSquare className="w-3 h-3 mr-1" />
                SMS Opt-Out
              </span>
            )}
            {contact.emailOptOut && (
              <span className="badge badge-gray flex items-center">
                <MailX className="w-3 h-3 mr-1" />
                Email Opt-Out
              </span>
            )}
          </div>
        </div>

        {/* Prospecting Data */}
        {contact.prospectScore && (
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div>
              <p className="text-sm text-gray-500">Prospect Score</p>
              <p className="text-xl font-semibold text-gray-900">{contact.prospectScore}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lifetime Value</p>
              <p className="text-xl font-semibold text-green-600">
                ${(contact.lifetimeValue || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Jobs</p>
              <p className="text-xl font-semibold text-gray-900">{contact.totalJobCount || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Job</p>
              <p className="text-xl font-semibold text-gray-900">
                {contact.lastJobDate ? new Date(contact.lastJobDate).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Form / Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-panda-primary" />
            Contact Information
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                  <input
                    type="tel"
                    name="mobilePhone"
                    value={formData.mobilePhone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMS Number (E.164 format)</label>
                <input
                  type="tel"
                  name="smsNumber"
                  value={formData.smsNumber}
                  onChange={handleInputChange}
                  placeholder="+12405551234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-900">{contact.firstName} {contact.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-900">{contact.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-900">{contact.phone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mobile</span>
                <span className="text-gray-900">{contact.mobilePhone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">SMS Number</span>
                <span className="text-gray-900">{contact.smsNumber || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Title</span>
                <span className="text-gray-900">{contact.title || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Department</span>
                <span className="text-gray-900">{contact.department || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Address */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-panda-primary" />
            Mailing Address
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                <input
                  type="text"
                  name="mailingStreet"
                  value={formData.mailingStreet}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    name="mailingCity"
                    value={formData.mailingCity}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    name="mailingState"
                    value={formData.mailingState}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select State</option>
                    {US_STATES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  name="mailingPostalCode"
                  value={formData.mailingPostalCode}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Street</span>
                <span className="text-gray-900">{contact.mailingStreet || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">City</span>
                <span className="text-gray-900">{contact.mailingCity || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">State</span>
                <span className="text-gray-900">{contact.mailingState || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Postal Code</span>
                <span className="text-gray-900">{contact.mailingPostalCode || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Preferences & Account */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MessageSquare className="w-5 h-5 mr-2 text-panda-primary" />
            Preferences
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Contact Method</label>
                <select
                  name="preferredContactMethod"
                  value={formData.preferredContactMethod}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select Method</option>
                  {CONTACT_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    name="doNotCall"
                    checked={formData.doNotCall}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">Do Not Call</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    name="smsOptOut"
                    checked={formData.smsOptOut}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">SMS Opt-Out</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    name="emailOptOut"
                    checked={formData.emailOptOut}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">Email Opt-Out</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    name="isPrimary"
                    checked={formData.isPrimary}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">Primary Contact for Account</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Preferred Contact</span>
                <span className="text-gray-900">{contact.preferredContactMethod || 'Any'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Do Not Call</span>
                <span className={contact.doNotCall ? 'text-red-600' : 'text-gray-900'}>
                  {contact.doNotCall ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">SMS Opt-Out</span>
                <span className={contact.smsOptOut ? 'text-red-600' : 'text-gray-900'}>
                  {contact.smsOptOut ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email Opt-Out</span>
                <span className={contact.emailOptOut ? 'text-red-600' : 'text-gray-900'}>
                  {contact.emailOptOut ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Primary Contact</span>
                <span className={contact.isPrimary ? 'text-green-600' : 'text-gray-900'}>
                  {contact.isPrimary ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Account Association */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Building2 className="w-5 h-5 mr-2 text-panda-primary" />
            Account
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Associated Account</label>
                <select
                  name="accountId"
                  value={formData.accountId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">No Account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Account</span>
                {contact.account ? (
                  <Link
                    to={`/accounts/${contact.account.id}`}
                    className="text-panda-primary hover:underline"
                  >
                    {contact.account.name}
                  </Link>
                ) : (
                  <span className="text-gray-900">-</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Opportunities */}
      {contact.opportunities && contact.opportunities.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-panda-primary" />
            Related Jobs
          </h2>
          <div className="space-y-2">
            {contact.opportunities.map(opp => (
              <Link
                key={opp.id}
                to={`/opportunities/${opp.id}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <span className="text-gray-900">{opp.name}</span>
                <span className={`badge ${
                  opp.stage === 'CLOSED_WON' ? 'badge-success' :
                  opp.stage === 'CLOSED_LOST' ? 'badge-error' : 'badge-info'
                }`}>
                  {opp.stage?.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            Created: {new Date(contact.createdAt).toLocaleString()}
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            Updated: {new Date(contact.updatedAt).toLocaleString()}
          </div>
          {contact.salesforceId && (
            <div>
              Salesforce ID: {contact.salesforceId}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
