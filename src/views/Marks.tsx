import { MARK_BOSSES } from '../core/domain';
import { sprite } from '../data';
import { useLang } from '../i18n';
import { MARK_IMAGE, markLevelWord } from '../labels';
import { characterName, type Derived } from '../model';
import { Sprite } from '../sprite';
import { Sheet } from '../ui';

export function Marks({ derived }: { derived: Derived }) {
  const { s } = useLang();
  const total = derived.marks.length * MARK_BOSSES.length;

  return (
    <>
      <Sheet title={s.marks} note={s.marksNote(derived.marksHard.done, derived.marksAny.done, total)}>
        <div style={{ overflowX: 'auto' }}>
          <table className="matrix">
            <colgroup>
              <col className="head" />
              {MARK_BOSSES.map((boss) => (
                <col key={boss} className="boss" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="head-label">{s.character}</th>
                {MARK_BOSSES.map((boss) => (
                  <th key={boss} title={MARK_IMAGE[boss]}>
                    <Sprite src={sprite.mark(MARK_IMAGE[boss], 'hard')} alt={MARK_IMAGE[boss]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {derived.marks.map((row, characterId) => (
                <tr key={characterId}>
                  <th className="row-head">
                    <Sprite src={sprite.character(characterName(characterId))} alt="" />
                    {characterName(characterId)}
                  </th>
                  {row.map((cell) => {
                    const level = cell.offline;
                    return (
                      <td key={cell.boss} data-level={level}>
                        {level > 0 ? (
                          <Sprite
                            src={sprite.mark(MARK_IMAGE[cell.boss], level === 2 ? 'hard' : 'normal')}
                            alt=""
                            title={`${characterName(characterId)} · ${MARK_IMAGE[cell.boss]} · ${markLevelWord(cell.boss, level === 2 ? 2 : 1, s)}`}
                          />
                        ) : (
                          <span className="void" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>
    </>
  );
}
