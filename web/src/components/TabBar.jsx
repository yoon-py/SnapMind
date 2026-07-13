export default function TabBar({ active, navigate }) {
  const tabs = [
    { id: 'home', icon: '🏠', label: '홈' },
    { id: 'input', icon: '✨', label: '생성' },
    { id: 'packs', icon: '📚', label: '팩' },
    { id: 'profile', icon: '👤', label: '프로필' },
  ]
  return (
    <div className="tabs">
      {tabs.map(t => (
        <div
          key={t.id}
          className={`tb${active === t.id ? ' on' : ''}`}
          onClick={() => navigate(t.id)}
        >
          <div className="ti">{t.icon}</div>
          <div className="tl">{t.label}</div>
        </div>
      ))}
    </div>
  )
}
