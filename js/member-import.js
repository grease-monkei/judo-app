/**
 * White Rock Judo Club — Active Member Import
 * 166 active members extracted from the official WRJC registration data.
 * Runs once on first launch — populates Cloud Firestore so all devices share the same member list.
 */

const MemberImport = (() => {

    // [lastName, firstName, birthday (YYYY-MM-DD)]
    const ACTIVE_MEMBERS = [
        ["Truter", "Kyden", "2012-10-07"],
        ["Liu", "Forest", "2021-02-20"],
        ["Wang", "Junnan", "2020-04-19"],
        ["Xia", "Amelia", "2018-06-19"],
        ["Tretiakov", "Daniel", "2014-09-04"],
        ["Bal", "Bikrampal", "2005-08-02"],
        ["Bal", "Karamvir", "1966-01-15"],
        ["Wang", "Jerry", "1970-10-19"],
        ["Wang", "Riko", "2014-03-08"],
        ["Lu", "Chloe", "2014-01-09"],
        ["Shook", "Andrew", "1975-10-31"],
        ["Shook", "Kieran", "2012-07-23"],
        ["Loncaric", "Anica", "2010-04-08"],
        ["Zenimaru", "Hinata", "2014-07-31"],
        ["Zenimaru", "Sosuke", "2017-08-18"],
        ["Zhang", "Vanessa", "2011-09-12"],
        ["Kolodiy", "Sofia", "2004-01-22"],
        ["Murokawa", "Manabu", "1977-01-28"],
        ["White", "Russell", "1944-12-09"],
        ["Clemas", "Richard", "1940-08-24"],
        ["Chen", "Michelle", "2016-02-01"],
        ["Wong", "Lucas", "2018-03-30"],
        ["Neufeldt", "Benjamin", "2012-06-10"],
        ["Van De Polder", "Kelso", "2015-04-16"],
        ["Storey", "Andrew", "2003-09-21"],
        ["Xia", "Sabrina", "2013-06-04"],
        ["McGarrigle", "Gavin", "1973-12-24"],
        ["Cormier", "Gabriel", "2014-01-14"],
        ["Zhuang", "Jeremy", "2012-02-23"],
        ["Zhuang", "Melanie", "2010-12-13"],
        ["Goodman", "Aaron", "1974-11-17"],
        ["Goodman", "Alexander", "2015-02-23"],
        ["Goodman", "Mia", "2017-04-19"],
        ["Zadymov", "Vitaly", "2016-04-16"],
        ["Colter", "Allison", "2016-12-16"],
        ["Kursar", "Cole", "2008-01-08"],
        ["Kumar", "Caleb", "2010-06-18"],
        ["Sungur", "Osman", "2010-01-07"],
        ["Smith", "Emma", "2015-07-02"],
        ["Aggarwal", "Meher", "2015-02-17"],
        ["Mah", "Emmalyn", "2012-04-06"],
        ["Jian", "Linhsuan", "2012-08-09"],
        ["Clemas", "Mike", "1964-03-10"],
        ["Masters", "Tim", "1986-12-21"],
        ["Masters", "Ryder", "2014-05-27"],
        ["Masters", "Clay", "2018-11-14"],
        ["Masters", "Asher", "2016-02-06"],
        ["Charbonneau", "Noah", "2020-03-29"],
        ["Lowe", "Alexandra", "2020-07-01"],
        ["Lowe", "Caira", "2018-06-20"],
        ["Lowe", "Kevin", "1983-01-28"],
        ["Singh", "Shanaya", "2014-05-28"],
        ["Singh", "Siana", "2017-06-18"],
        ["Gill", "Mohkam", "2019-01-27"],
        ["Pavlushik", "Timothy", "2005-08-31"],
        ["Ponce", "Kendrick", "2020-12-20"],
        ["Cooke", "Kingston", "2018-11-13"],
        ["Hoffmann", "David", "1979-06-15"],
        ["Hoffmann", "Perrin", "2012-06-29"],
        ["Mirchandani", "Zoe", "2020-05-31"],
        ["Wiebe", "Connor", "1997-09-02"],
        ["Nickel", "Zachary", "2013-03-19"],
        ["Palmer", "Austin", "2019-08-08"],
        ["Palmer", "Logan", "2017-11-02"],
        ["Palmer", "Michael", "1981-12-02"],
        ["Radlowski", "Gabriel", "2013-07-23"],
        ["Radlowski", "Bloom", "2015-04-17"],
        ["Lu", "Scarlett", "2016-12-24"],
        ["Sahni", "Siya", "2017-02-05"],
        ["Ecclestone", "David", "1986-12-28"],
        ["Lin", "Athena", "2015-05-13"],
        ["Lin", "Jayden", "2012-11-09"],
        ["Tate", "Warwick", "2014-06-29"],
        ["Wigueras-Morgan", "Leo", "2017-05-08"],
        ["Qian", "Max", "2015-03-05"],
        ["Elliott", "Thomas", "2015-09-18"],
        ["Johal", "Jovi", "2016-09-30"],
        ["Johal", "Lev", "2020-03-20"],
        ["Lu", "Olivia", "2015-11-12"],
        ["Van Kooten", "Cornelis", "1951-09-23"],
        ["Zhang", "Sophia", "2015-01-21"],
        ["Zhang", "Victoria G", "2020-07-22"],
        ["Carrasco", "Kyera", "2016-06-23"],
        ["Griffin", "Kayan", "2016-03-29"],
        ["Lopez", "Mateo", "2014-07-13"],
        ["Hersi", "Adam", "2021-05-17"],
        ["Hersi", "Ammar", "2019-03-03"],
        ["Hersi", "Hidaya", "2013-06-26"],
        ["Hersi", "Nadah", "2015-06-26"],
        ["Hersi", "Zahra", "2017-01-21"],
        ["Conner", "Kai", "2020-07-19"],
        ["Chiu", "Mason", "2019-04-22"],
        ["Harris", "Niko", "2015-02-07"],
        ["McBride", "Alexander", "2018-02-21"],
        ["Parent", "Lukasz", "2020-01-09"],
        ["Hernandez Gomez", "Alberto", "1974-07-01"],
        ["Hardychuk", "Brad", "1981-05-20"],
        ["Roche", "Mark", "1975-03-12"],
        ["Chan", "Julian", "2014-04-10"],
        ["Han", "Jinu", "2013-09-15"],
        ["Han", "Luah", "2015-06-26"],
        ["Gafton", "Damian", "2015-05-20"],
        ["Lee", "Finn", "2018-02-23"],
        ["Dickinson", "Raissa", "1988-05-04"],
        ["Spink", "Angus", "2020-09-03"],
        ["Mah", "Noah", "2014-08-15"],
        ["Uppal", "Arjun", "2019-07-19"],
        ["Uppal", "Ekam", "2016-08-16"],
        ["Dhott", "Aarien", "2017-12-16"],
        ["Wang", "Daniel", "2019-05-06"],
        ["Li", "Max", "2014-11-24"],
        ["Kang", "Grayson", "2021-06-29"],
        ["Mrar", "Balkaran", "1999-09-18"],
        ["Detchev", "Radoslav", "1993-07-08"],
        ["Tsai", "Elias", "2017-04-25"],
        ["Schubert", "Evelyn", "2018-10-31"],
        ["Tran", "Makayla", "2015-04-16"],
        ["Kandola", "Harjeet", "1984-04-03"],
        ["Bulich", "Dominic", "2017-10-09"],
        ["Singh", "Ayla", "2016-02-09"],
        ["Bashir", "Alisha", "2017-12-09"],
        ["Kim", "Max", "2016-10-05"],
        ["Singh", "Meva", "2015-08-16"],
        ["Cruz", "Catalina", "2014-06-21"],
        ["Cruz", "Jaxon", "2017-01-17"],
        ["McEathron", "Xander", "2017-05-25"],
        ["Shao", "Matt", "2014-04-14"],
        ["Gill", "Kiara", "2020-10-15"],
        ["Reyes", "Cyan", "2011-03-25"],
        ["Reyes", "Ruel", "1972-01-30"],
        ["Weatherby", "William", "2011-09-17"],
        ["Cai", "Anne", "1972-08-12"],
        ["Pastrana", "Sergio", "1975-06-13"],
        ["Lawrence", "Eddie", "2020-07-30"],
        ["Gill", "Camilla", "2020-05-24"],
        ["Gill", "Dominic", "2018-08-30"],
        ["Bulich", "Mateo", "2019-11-02"],
        ["McBride", "Cielo", "2020-10-04"],
        ["McIlroy", "Madz", "2015-09-01"],
        ["On", "Han", "1995-03-28"],
        ["Serretta", "Henri", "2018-05-02"],
        ["Buchanan", "Hannah", "2021-05-09"],
        ["Simidu", "Alice", "2015-11-16"],
        ["Simidu", "Thomas", "2015-11-16"],
        ["Savinov", "Vladyslav", "2019-03-07"],
        ["Gill", "Joseph", "1988-01-20"],
        ["Geng", "Charlie", "2014-10-13"],
        ["Choo", "Jachin", "2015-06-06"],
        ["Wang", "Myka", "2016-10-18"],
        ["Cook", "Loic", "2017-10-02"],
        ["Cook", "Nicolas", "2015-01-28"],
        ["Cieslak", "Anna", "2021-11-21"],
        ["Lu", "Hill", "1980-12-29"],
        ["Talwar", "Avyaan", "2020-08-18"],
        ["Xiao", "Kevin", "1999-09-02"],
        ["Lo", "Emma", "2022-05-18"],
        ["Skare", "Matias", "2020-02-02"],
        ["Spink", "Rory", "2022-04-11"],
        ["Hayre", "Zara", "2014-07-13"],
        ["Sidhu", "Sienna", "2020-10-25"],
        ["Chreptyk", "Koa", "2020-11-22"],
        ["Benzi Ribeiro", "Matteo", "2020-10-28"],
        ["Luo", "Jeffrey", "2017-12-26"],
        ["Weiss", "Emerson", "2018-07-10"],
        ["Gibson", "Zoey", "2021-08-17"],
        ["Reed", "Mackenzie", "2020-06-30"]
    ];

    /**
     * Import all active members into Firestore.
     * Uses a settings flag to ensure this only runs once across all devices.
     */
    async function importIfNeeded() {
        const imported = await DB.Settings.get('membersImported');
        if (imported) {
            console.log('✅ Members already imported, skipping.');
            return false;
        }

        console.log(`🥋 Importing ${ACTIVE_MEMBERS.length} active members...`);

        // Use Firestore batch writes for efficiency (max 500 per batch)
        const db = firestore;
        let batch = db.batch();
        let count = 0;

        for (const [lastName, firstName, birthday] of ACTIVE_MEMBERS) {
            // Deterministic ID: "firstname-lastname-birthday"
            const deterministicId = `${firstName.toLowerCase().replace(/\s/g, '-')}-${lastName.toLowerCase().replace(/\s/g, '-')}-${birthday || '0000'}`;
            const docRef = db.collection('members').doc(deterministicId);
            
            batch.set(docRef, {
                firstName: firstName,
                lastName: lastName,
                email: '',
                phone: '',
                belt: '',
                birthday: birthday || null,
                isActive: true,
                attendanceCount: 0,
                createdAt: new Date().toISOString()
            });
            count++;

            // Firestore batches limited to 500 operations
            if (count % 450 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }

        // Commit remaining
        await batch.commit();

        // Mark as imported so it won't run again
        await DB.Settings.set('membersImported', true);

        console.log(`✅ Successfully imported ${ACTIVE_MEMBERS.length} active members to Firestore`);
        return true;
    }

    return { importIfNeeded };
})();
